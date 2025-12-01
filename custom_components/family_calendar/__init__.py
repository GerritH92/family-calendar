"""Family Calendar Integration."""
import inspect
import logging
from datetime import datetime
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.components import frontend
from homeassistant.components.calendar import DOMAIN as CALENDAR_DOMAIN
from homeassistant.components.http import HomeAssistantView, StaticPathConfig
import os
from aiohttp import web

_LOGGER = logging.getLogger(__name__)

DOMAIN = "family_calendar"

async def _async_register_static_path(hass: HomeAssistant):
    """Register the static path for frontend files."""
    # Use realpath to resolve any symlinks (common in HACS setups)
    file_path = os.path.realpath(__file__)
    dir_path = os.path.dirname(file_path)
    path = os.path.join(dir_path, "www")
    
    _LOGGER.info(f"Family Calendar: Registering static path: {path}")
    
    # Use executor to avoid blocking the event loop with file I/O
    def check_path_contents(p):
        if os.path.exists(p):
            return os.listdir(p)
        return None

    try:
        contents = await hass.async_add_executor_job(check_path_contents, path)
        if contents is not None:
            _LOGGER.info(f"Family Calendar: Path exists. Contents: {contents}")
        else:
            _LOGGER.error(f"Family Calendar: Path does not exist at {path}")
    except Exception as e:
        _LOGGER.error(f"Family Calendar: Error checking path: {e}")
        
    # Check if http component is loaded
    if "http" not in hass.config.components:
        _LOGGER.warning("Family Calendar: HTTP component not found in hass.config.components")
        
    try:
        await hass.http.async_register_static_paths([
            StaticPathConfig("/family_calendar_static", path, False)
        ])
    except TypeError:
        # Fallback for older HA versions that expect a tuple
        _LOGGER.warning("Family Calendar: Falling back to tuple for static path registration")
        await hass.http.async_register_static_paths([("/family_calendar_static", path)])

async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    """Set up the integration."""
    hass.data.setdefault(DOMAIN, {})
    await _async_register_static_path(hass)
    return True


class FamilyCalendarWeatherView(HomeAssistantView):
    """View to return weather forecast."""

    url = "/api/family_calendar/weather"
    name = "api:family_calendar:weather"
    requires_auth = False

    def __init__(self, hass: HomeAssistant):
        """Initialize the view."""
        self.hass = hass

    async def get(self, request):
        """Handle GET request for weather."""
        weather_entity = self.hass.data.get(DOMAIN, {}).get("weather_entity")
        
        if not weather_entity:
            return web.json_response({"error": "No weather entity configured"}, status=404)
            
        try:
            # Try to get forecast using the service (modern way)
            if self.hass.services.has_service("weather", "get_forecasts"):
                response = await self.hass.services.async_call(
                    "weather",
                    "get_forecasts",
                    {"entity_id": weather_entity, "type": "daily"},
                    blocking=True,
                    return_response=True
                )
                if response and weather_entity in response:
                    return web.json_response(response[weather_entity].get("forecast", []))
            
            # Fallback to state attributes (legacy way)
            state = self.hass.states.get(weather_entity)
            if state and "forecast" in state.attributes:
                return web.json_response(state.attributes["forecast"])
                
            return web.json_response({"error": "No forecast data available"}, status=404)
            
        except Exception as e:
            _LOGGER.error(f"Error fetching weather: {e}")
            return web.json_response({"error": str(e)}, status=500)


class FamilyCalendarEventsView(HomeAssistantView):
    """View to return calendar events."""

    url = "/api/family_calendar/events"
    name = "api:family_calendar:events"
    requires_auth = False

    def __init__(self, hass: HomeAssistant):
        """Initialize the view."""
        self.hass = hass

    async def get(self, request):
        """Handle GET request for events."""
        calendar_entity = request.query.get("calendar")
        start = request.query.get("start")
        end = request.query.get("end")
        
        if not calendar_entity or not start or not end:
            return web.json_response({"error": "Missing parameters"}, status=400)
        
        try:
            from datetime import datetime
            
            _LOGGER.debug(f"Proxy: Fetching events for {calendar_entity}")
            
            start_dt = datetime.fromisoformat(start.replace('Z', '+00:00'))
            end_dt = datetime.fromisoformat(end.replace('Z', '+00:00'))
            
            # Get all calendar entities from the entity registry
            from homeassistant.helpers import entity_registry as er
            
            entity_reg = er.async_get(self.hass)
            entity_entry = entity_reg.async_get(calendar_entity)
            
            if not entity_entry:
                _LOGGER.warning(f"Entity not found in registry: {calendar_entity}")
                return web.json_response([])
            
            # Get the state to verify it exists
            state = self.hass.states.get(calendar_entity)
            if not state:
                _LOGGER.warning(f"Entity state not found: {calendar_entity}")
                return web.json_response([])
            
            # Try to get the entity object from the platform
            # Calendar entities are typically in the calendar domain
            from homeassistant.components.calendar import DOMAIN as CALENDAR_DOMAIN
            
            # Get calendar platform entities
            if "entity_components" not in self.hass.data:
                _LOGGER.error("entity_components not in hass.data")
                return web.json_response([])
            
            entity_component = self.hass.data["entity_components"].get(CALENDAR_DOMAIN)
            if not entity_component:
                _LOGGER.error(f"Calendar component not found")
                return web.json_response([])
            
            # Find the entity
            calendar_entity_obj = entity_component.get_entity(calendar_entity)
            if not calendar_entity_obj:
                _LOGGER.warning(f"Calendar entity object not found: {calendar_entity}")
                return web.json_response([])
            
            # Get events
            _LOGGER.debug(f"Calling async_get_events on {calendar_entity}")
            events = await calendar_entity_obj.async_get_events(self.hass, start_dt, end_dt)
            
            # Convert to dict format
            events_list = []
            for event in events:
                event_dict = {
                    "summary": event.summary,
                    "start": {},
                    "end": {},
                }
                
                # Check if it's an all-day event
                if not hasattr(event.start, 'hour'):
                    # All-day event
                    event_dict["start"]["date"] = event.start.strftime("%Y-%m-%d")
                    event_dict["end"]["date"] = event.end.strftime("%Y-%m-%d")
                else:
                    # Timed event
                    event_dict["start"]["dateTime"] = event.start.isoformat()
                    event_dict["end"]["dateTime"] = event.end.isoformat()
                
                if hasattr(event, 'description') and event.description:
                    event_dict["description"] = event.description
                if hasattr(event, 'location') and event.location:
                    event_dict["location"] = event.location
                if hasattr(event, 'uid') and event.uid:
                    event_dict["uid"] = event.uid
                
                events_list.append(event_dict)
            
            _LOGGER.debug(f"Proxy: Returning {len(events_list)} events for {calendar_entity}")
            return web.json_response(events_list)
            
        except Exception as e:
            _LOGGER.error(f"Proxy error fetching events: {e}", exc_info=True)
            return web.json_response({"error": str(e)}, status=500)


class FamilyCalendarAddEventView(HomeAssistantView):
    """View to add events to calendars."""

    url = "/api/family_calendar/add_event"
    name = "api:family_calendar:add_event"
    requires_auth = False

    def __init__(self, hass: HomeAssistant):
        """Initialize the view."""
        self.hass = hass

    async def post(self, request):
        """Handle POST request to add event."""
        try:
            data = await request.json()
            
            calendar_entity = data.get("calendar_entity")
            summary = data.get("summary")
            start_date_time = data.get("start_date_time")
            end_date_time = data.get("end_date_time")
            description = data.get("description", "")
            location = data.get("location", "")
            
            _LOGGER.debug(f"Add event request for {calendar_entity}: {summary}")
            
            if not all([calendar_entity, summary, start_date_time, end_date_time]):
                return web.json_response({"error": "Missing required fields"}, status=400)
            
            # Build service data for Google Calendar
            # Google service expects strings in format "YYYY-MM-DD HH:MM:SS"
            google_service_data = {
                "entity_id": calendar_entity,
                "summary": summary,
                "start_date_time": start_date_time,
                "end_date_time": end_date_time,
            }
            
            if description:
                google_service_data["description"] = description
            if location:
                google_service_data["location"] = location
            
            _LOGGER.debug(f"Calling google.create_event for {calendar_entity}")
            _LOGGER.debug(f"Google service data: {google_service_data}")
            
            # Try google.create_event first (for Google Calendar)
            try:
                await self.hass.services.async_call(
                    "google",
                    "create_event",
                    google_service_data,
                    blocking=True
                )
                _LOGGER.info(f"Successfully created event '{summary}' using google.create_event")
                return web.json_response({"success": True})
            except Exception as google_error:
                _LOGGER.error(f"google.create_event failed: {type(google_error).__name__}: {google_error}")
                
                # Parse datetime for fallback
                start_dt = datetime.strptime(start_date_time, "%Y-%m-%d %H:%M:%S")
                end_dt = datetime.strptime(end_date_time, "%Y-%m-%d %H:%M:%S")
                
                # Build fallback service data for calendar.create_event
                calendar_service_data = {
                    "entity_id": calendar_entity,
                    "summary": summary,
                    "start_date_time": start_dt,
                    "end_date_time": end_dt,
                }
                
                if description:
                    calendar_service_data["description"] = description
                if location:
                    calendar_service_data["location"] = location
                
                _LOGGER.debug(f"Trying fallback: calendar.create_event")
                
                # Fall back to calendar.create_event for other calendar types
                try:
                    await self.hass.services.async_call(
                        "calendar",
                        "create_event",
                        calendar_service_data,
                        blocking=True
                    )
                    _LOGGER.info(f"Successfully created event '{summary}' using calendar.create_event")
                    return web.json_response({"success": True})
                except Exception as calendar_error:
                    google_msg = str(google_error)
                    calendar_msg = str(calendar_error)
                    _LOGGER.error(f"calendar.create_event also failed: {calendar_msg}")
                    
                    permission_error = (
                        "This calendar is read-only or missing write permissions. "
                        "Select a calendar that supports event creation (Local/CalDAV) or reconfigure the Google integration "
                        "with write access."
                    )
                    return web.json_response({
                        "error": permission_error,
                        "calendar": calendar_entity,
                        "google_error": google_msg,
                        "calendar_error": calendar_msg
                    }, status=403)
            
        except Exception as e:
            _LOGGER.error(f"Failed to create event: {e}", exc_info=True)
            return web.json_response({"error": str(e)}, status=500)


class FamilyCalendarUpdateEventView(HomeAssistantView):
    """View to update events in calendars."""

    url = "/api/family_calendar/update_event"
    name = "api:family_calendar:update_event"
    requires_auth = False

    def __init__(self, hass: HomeAssistant):
        """Initialize the view."""
        self.hass = hass

    async def post(self, request):
        """Handle POST request to update event."""
        try:
            data = await request.json()
            
            calendar_entity = data.get("calendar_entity")
            event_uid = data.get("event_uid")
            summary = data.get("summary")
            start_date_time = data.get("start_date_time")
            end_date_time = data.get("end_date_time")
            description = data.get("description", "")
            location = data.get("location", "")
            
            _LOGGER.debug(f"Update event request for {calendar_entity}: {summary}")
            
            if not all([calendar_entity, event_uid, summary, start_date_time, end_date_time]):
                return web.json_response({"error": "Missing required fields"}, status=400)
            
            # Strategy: Delete the old event and create a new one
            # This is the most compatible approach across different calendar integrations
            
            # Step 1: Try to delete the existing event using multiple methods
            _LOGGER.info(f"Attempting to delete event {event_uid} from {calendar_entity}")
            
            delete_payload = {
                "entity_id": calendar_entity,
                "event_id": event_uid,
                "uid": event_uid,
            }
            
            deletion_success = False
            deletion_attempts = []
            
            # Try all available delete services
            for domain, service in (
                ("google", "delete_event"),
                ("google", "remove_event"),
                ("calendar", "delete_event"),
                ("calendar", "remove_event"),
            ):
                if not self.hass.services.has_service(domain, service):
                    continue

                try:
                    await self.hass.services.async_call(
                        domain,
                        service,
                        delete_payload,
                        blocking=True,
                    )
                    _LOGGER.info(f"Successfully deleted old event {event_uid} using {domain}.{service}")
                    deletion_success = True
                    break
                except Exception as e:
                    msg = f"{domain}.{service} failed: {e}"
                    _LOGGER.debug(msg)
                    deletion_attempts.append(msg)
            
            # If services didn't work, try direct entity method
            if not deletion_success:
                from homeassistant.components.calendar import DOMAIN as CALENDAR_DOMAIN
                
                entity_component = self.hass.data.get("entity_components", {}).get(CALENDAR_DOMAIN)
                calendar_entity_obj = None
                if entity_component:
                    calendar_entity_obj = entity_component.get_entity(calendar_entity)
                
                if calendar_entity_obj:
                    _LOGGER.debug(f"Attempting direct entity delete for {calendar_entity}")
                    for attr_name in ("async_delete_event", "async_remove_event", "delete_event", "remove_event"):
                        handler = getattr(calendar_entity_obj, attr_name, None)
                        if not handler:
                            continue
                        
                        try:
                            if attr_name.startswith("async_"):
                                await handler(event_uid)
                            else:
                                await self.hass.async_add_executor_job(handler, event_uid)
                            
                            _LOGGER.info(f"Successfully deleted event {event_uid} using entity method {attr_name}")
                            deletion_success = True
                            break
                        except Exception as e:
                            msg = f"Entity method {attr_name} failed: {e}"
                            _LOGGER.debug(msg)
                            deletion_attempts.append(msg)
            
            if not deletion_success:
                _LOGGER.warning(f"Could not delete old event {event_uid}. Attempts: {deletion_attempts}")
                # Continue anyway - maybe the event doesn't exist anymore
            else:
                # Wait a moment for deletion to propagate
                import asyncio
                await asyncio.sleep(0.5)
            
            # Step 2: Create the updated event
            google_service_data = {
                "entity_id": calendar_entity,
                "summary": summary,
                "start_date_time": start_date_time,
                "end_date_time": end_date_time,
            }
            
            if description:
                google_service_data["description"] = description
            if location:
                google_service_data["location"] = location
            
            _LOGGER.debug(f"Creating updated event in: {calendar_entity}")
            
            # Try google.create_event first (for Google Calendar)
            try:
                await self.hass.services.async_call(
                    "google",
                    "create_event",
                    google_service_data,
                    blocking=True
                )
                _LOGGER.info(f"Successfully updated event '{summary}' using google.create_event")
                return web.json_response({"success": True})
            except Exception as google_error:
                _LOGGER.error(f"google.create_event failed: {type(google_error).__name__}: {google_error}")
                
                # Parse datetime for fallback
                start_dt = datetime.strptime(start_date_time, "%Y-%m-%d %H:%M:%S")
                end_dt = datetime.strptime(end_date_time, "%Y-%m-%d %H:%M:%S")
                
                # Build fallback service data for calendar.create_event
                calendar_service_data = {
                    "entity_id": calendar_entity,
                    "summary": summary,
                    "start_date_time": start_dt,
                    "end_date_time": end_dt,
                }
                
                if description:
                    calendar_service_data["description"] = description
                if location:
                    calendar_service_data["location"] = location
                
                _LOGGER.debug(f"Trying fallback: calendar.create_event")
                
                # Fall back to calendar.create_event for other calendar types
                try:
                    await self.hass.services.async_call(
                        "calendar",
                        "create_event",
                        calendar_service_data,
                        blocking=True
                    )
                    _LOGGER.info(f"Successfully updated event '{summary}' using calendar.create_event")
                    return web.json_response({"success": True})
                except Exception as calendar_error:
                    google_msg = str(google_error)
                    calendar_msg = str(calendar_error)
                    _LOGGER.error(f"calendar.create_event also failed: {calendar_msg}")
                    
                    permission_error = (
                        "Failed to update event. The calendar may be read-only or missing write permissions."
                    )
                    return web.json_response({
                        "error": permission_error,
                        "calendar": calendar_entity,
                        "google_error": google_msg,
                        "calendar_error": calendar_msg
                    }, status=403)
            
        except Exception as e:
            _LOGGER.error(f"Failed to update event: {e}", exc_info=True)
            return web.json_response({"error": str(e)}, status=500)


class FamilyCalendarDeleteEventView(HomeAssistantView):
    """View to delete events from calendars."""

    url = "/api/family_calendar/delete_event"
    name = "api:family_calendar:delete_event"
    requires_auth = False

    def __init__(self, hass: HomeAssistant):
        """Initialize the view."""
        self.hass = hass

    async def post(self, request):
        """Handle POST request to delete an event."""
        try:
            data = await request.json()
            calendar_entity = data.get("calendar_entity")
            event_uid = data.get("event_uid") or data.get("event_id")

            if not calendar_entity or not event_uid:
                return web.json_response(
                    {"error": "Missing calendar_entity or event_uid"}, status=400
                )

            _LOGGER.info(
                "Delete event request for %s (event %s)", calendar_entity, event_uid
            )

            # Provide multiple attribute names since integrations differ on payloads
            service_payload = {
                "entity_id": calendar_entity,
                "event_id": event_uid,
                "uid": event_uid,
            }

            deletion_attempts = []
            for domain, service in (
                ("google", "delete_event"),
                ("google", "remove_event"),
                ("calendar", "delete_event"),
                ("calendar", "remove_event"),
            ):
                if not self.hass.services.has_service(domain, service):
                    continue

                try:
                    await self.hass.services.async_call(
                        domain,
                        service,
                        service_payload,
                        blocking=True,
                    )
                    _LOGGER.info(
                        "Deleted event %s from %s using %s.%s",
                        event_uid,
                        calendar_entity,
                        domain,
                        service,
                    )
                    return web.json_response({"success": True})
                except Exception as service_error:
                    msg = f"{domain}.{service} failed: {service_error}"
                    _LOGGER.error(msg)
                    deletion_attempts.append(msg)

            entity_component = self.hass.data.get("entity_components", {}).get(
                CALENDAR_DOMAIN
            )
            calendar_entity_obj = None
            if entity_component:
                calendar_entity_obj = entity_component.get_entity(calendar_entity)

            if calendar_entity_obj:
                _LOGGER.debug(
                    "Attempting direct entity delete for %s", calendar_entity
                )
                for attr_name in (
                    "async_delete_event",
                    "async_remove_event",
                    "delete_event",
                    "remove_event",
                ):
                    handler = getattr(calendar_entity_obj, attr_name, None)
                    if not handler:
                        continue

                    try:
                        result = handler(event_uid)
                        if inspect.isawaitable(result):
                            await result
                        _LOGGER.info(
                            "Deleted event %s from %s via entity.%s",
                            event_uid,
                            calendar_entity,
                            attr_name,
                        )
                        return web.json_response({"success": True})
                    except Exception as entity_error:
                        msg = f"entity.{attr_name} failed: {entity_error}"
                        _LOGGER.error(msg)
                        deletion_attempts.append(msg)

            if deletion_attempts:
                return web.json_response(
                    {
                        "error": "Unable to delete event – calendar may be read-only or does not expose a supported delete service.",
                        "calendar": calendar_entity,
                        "details": deletion_attempts,
                    },
                    status=403,
                )

            return web.json_response(
                {
                    "error": "No supported calendar delete service available in Home Assistant.",
                    "calendar": calendar_entity,
                },
                status=501,
            )

        except Exception as error:
            _LOGGER.error(f"Failed to delete event: {error}", exc_info=True)
            return web.json_response({"error": str(error)}, status=500)

class FamilyCalendarConfigView(HomeAssistantView):
    """View to return family calendar configuration."""

    url = "/api/family_calendar/config"
    name = "api:family_calendar:config"
    requires_auth = False

    def __init__(self, hass: HomeAssistant):
        """Initialize the view."""
        self.hass = hass

    async def get(self, request):
        """Handle GET request."""
        calendars = self.hass.data.get(DOMAIN, {}).get("calendars", [])
        colors = self.hass.data.get(DOMAIN, {}).get("colors", {})
        names = self.hass.data.get(DOMAIN, {}).get("names", {})
        weather_entity = self.hass.data.get(DOMAIN, {}).get("weather_entity")
        
        _LOGGER.debug(f"API called - returning {len(calendars)} calendars")
        
        return web.json_response({
            "calendars": calendars,
            "colors": colors,
            "names": names,
            "weather_entity": weather_entity
        })

async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up from config entry."""
    hass.data.setdefault(DOMAIN, {})
    
    # Register the API views - check each one individually
    views_to_register = [
        (FamilyCalendarConfigView, '_config_view_registered'),
        (FamilyCalendarEventsView, '_events_view_registered'),
        (FamilyCalendarAddEventView, '_add_event_view_registered'),
        (FamilyCalendarUpdateEventView, '_update_event_view_registered'),
        (FamilyCalendarDeleteEventView, '_delete_event_view_registered'),
        (FamilyCalendarWeatherView, '_weather_view_registered'),
    ]

    for view_class, flag in views_to_register:
        if flag not in hass.data[DOMAIN]:
            try:
                hass.http.register_view(view_class(hass))
                hass.data[DOMAIN][flag] = True
                _LOGGER.debug(f"Registered {view_class.__name__}")
            except Exception as e:
                _LOGGER.error(f"Failed to register {view_class.__name__}: {e}")
    
    # Store the calendar entity and color in the domain data
    calendar_entity = entry.data.get("calendar_entity")
    color = entry.data.get("color", "#2196f3")
    name = entry.data.get("name")
    weather_entity = entry.data.get("weather_entity")
    
    if calendar_entity:
        if "calendars" not in hass.data[DOMAIN]:
            hass.data[DOMAIN]["calendars"] = []
        if calendar_entity not in hass.data[DOMAIN]["calendars"]:
            hass.data[DOMAIN]["calendars"].append(calendar_entity)
        
        # Store colors separately
        if "colors" not in hass.data[DOMAIN]:
            hass.data[DOMAIN]["colors"] = {}
        hass.data[DOMAIN]["colors"][calendar_entity] = color

        # Store names separately
        if "names" not in hass.data[DOMAIN]:
            hass.data[DOMAIN]["names"] = {}
        if name:
            hass.data[DOMAIN]["names"][calendar_entity] = name
            
        # Store weather entity globally (last one wins)
        if weather_entity:
            hass.data[DOMAIN]["weather_entity"] = weather_entity
    
    hass.data[DOMAIN][entry.entry_id] = entry.data
    
    # Register the sidebar panel with a fixed URL to prevent duplicates
    panel_name = "Family Calendar"
    panel_url = "family_calendar"  # Fixed URL instead of unique per entry
    
    # Ensure static path is registered (idempotent)
    await _async_register_static_path(hass)
    
    # Only register if not already registered
    # Note: We check if it's in frontend_panels to avoid duplicate registration warnings
    # but we also want to ensure it's registered if we just reloaded the integration
    
    # Use a fixed version for cache busting to avoid confusion
    # In production, this should match manifest version
    version = "1.0.0"
    
    # Always try to remove it first to ensure we have the latest config
    # This might cause the "Removing unknown panel" warning if it didn't exist, which is fine
    try:
        frontend.async_remove_panel(hass, panel_url)
    except Exception:
        pass
    
    frontend.async_register_built_in_panel(
        hass,
        component_name="iframe",
        sidebar_title=panel_name,
        sidebar_icon="mdi:calendar-account",
        frontend_url_path=panel_url,
        config={
            "url": f"/family_calendar_static/calendar.html?v={version}"
        },
        require_admin=False,
    )
    
    return True

async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    # Remove calendar from the list
    calendar_entity = entry.data.get("calendar_entity")
    if calendar_entity and "calendars" in hass.data.get(DOMAIN, {}):
        if calendar_entity in hass.data[DOMAIN]["calendars"]:
            hass.data[DOMAIN]["calendars"].remove(calendar_entity)
    
    # Remove panel only if this is the last entry
    panel_url = "family_calendar"
    
    # Check if there are other family_calendar entries
    other_entries = [
        e for e in hass.config_entries.async_entries(DOMAIN)
        if e.entry_id != entry.entry_id
    ]
    
    if not other_entries:
        # This is the last entry, remove the panel
        frontend.async_remove_panel(hass, panel_url)
    
    if entry.entry_id in hass.data[DOMAIN]:
        hass.data[DOMAIN].pop(entry.entry_id)
    
    return True
