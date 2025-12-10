"""Config flow for Family Calendar."""
import voluptuous as vol
import random
from homeassistant.config_entries import ConfigFlow, OptionsFlow
from homeassistant.data_entry_flow import FlowResult
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.selector import selector
from homeassistant.core import callback

from .const import DOMAIN

# Color palette for random selection - brighter colors
COLOR_PALETTE = [
    "#4FC3F7",  # Light Blue
    "#BA68C8",  # Light Purple
    "#81C784",  # Light Green
    "#FFB74D",  # Light Orange
    "#F06292",  # Light Pink
    "#4DB6AC",  # Light Teal
    "#FF7043",  # Light Red
    "#9575CD",  # Medium Purple
    "#7986CB",  # Medium Indigo
    "#4DD0E1",  # Light Cyan
    "#AED581",  # Light Lime
    "#FFD54F",  # Light Amber
    "#FF8A65",  # Light Deep Orange
    "#A1887F",  # Light Brown
    "#90A4AE",  # Light Blue Grey
]

class FamilyCalendarConfigFlow(ConfigFlow, domain=DOMAIN):
    """Family Calendar config flow."""
    
    VERSION = 1
    
    @staticmethod
    @callback
    def async_get_options_flow(config_entry):
        """Get the options flow for this handler."""
        return FamilyCalendarOptionsFlow(config_entry)
    
    async def async_step_user(self, user_input=None) -> FlowResult:
        """Handle a flow initialized by the user."""
        if user_input is not None:
            # Convert RGB list to hex if needed
            color = user_input.get("color")
            if isinstance(color, list) and len(color) == 3:
                # RGB list [r, g, b] to hex
                user_input["color"] = "#{:02x}{:02x}{:02x}".format(color[0], color[1], color[2])
            elif not color:
                user_input["color"] = random.choice(COLOR_PALETTE)
            
            return self.async_create_entry(
                title=f"Calendar: {user_input.get('calendar_entity', 'Unknown')}", 
                data=user_input
            )
        
        # Get all calendar entities
        entity_reg = er.async_get(self.hass)
        calendar_entities = [
            entity.entity_id
            for entity in entity_reg.entities.values()
            if entity.domain == "calendar" and not entity.entity_id.startswith("calendar.family_calendar")
        ]
        
        # Build schema with random default color
        schema_dict = {}
        
        if calendar_entities:
            calendar_dict = {entity: entity for entity in calendar_entities}
            default_color_hex = random.choice(COLOR_PALETTE)
            # Convert hex to RGB for the color picker with good default brightness
            r = int(default_color_hex[1:3], 16)
            g = int(default_color_hex[3:5], 16)
            b = int(default_color_hex[5:7], 16)
            default_color_rgb = [r, g, b]
            
            schema_dict[vol.Required("calendar_entity")] = selector({
                "entity": {"domain": "calendar", "multiple": False}
            })
            schema_dict[vol.Optional("name")] = str
            schema_dict[vol.Optional("weather_entity")] = selector({
                "entity": {"domain": "weather", "multiple": False}
            })
            schema_dict[vol.Optional("color", default=default_color_rgb)] = selector({
                "color_rgb": {}
            })
        
        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema(schema_dict),
        )


class FamilyCalendarOptionsFlow(OptionsFlow):
    """Handle options flow for Family Calendar."""

    def __init__(self, config_entry):
        """Initialize options flow."""
        self.config_entry = config_entry

    async def async_step_init(self, user_input=None):
        """Manage the options."""
        if user_input is not None:
            try:
                # Convert RGB list to hex if needed
                color = user_input.get("color")
                if isinstance(color, list) and len(color) == 3:
                    color = "#{:02x}{:02x}{:02x}".format(color[0], color[1], color[2])
                elif not color:
                    color = "#2196f3"
                
                # Update the config entry data with new color
                new_data = dict(self.config_entry.data)
                new_data["color"] = color
                
                # Update name if provided
                name = user_input.get("name", "")
                if name:
                    new_data["name"] = name
                elif "name" in new_data:
                    # Remove name if cleared
                    new_data.pop("name", None)
                
                # Update weather entity if provided
                weather = user_input.get("weather_entity", "")
                if weather:
                    new_data["weather_entity"] = weather
                elif "weather_entity" in new_data:
                    # Remove weather entity if cleared
                    new_data.pop("weather_entity", None)
                
                # Update the config entry
                self.hass.config_entries.async_update_entry(
                    self.config_entry, data=new_data
                )
                
                # Update the runtime data in hass.data
                calendar_entity = self.config_entry.data.get("calendar_entity")
                if calendar_entity and DOMAIN in self.hass.data:
                    if "colors" not in self.hass.data[DOMAIN]:
                        self.hass.data[DOMAIN]["colors"] = {}
                    self.hass.data[DOMAIN]["colors"][calendar_entity] = color
                    
                    if "names" not in self.hass.data[DOMAIN]:
                        self.hass.data[DOMAIN]["names"] = {}
                    if name:
                        self.hass.data[DOMAIN]["names"][calendar_entity] = name
                    elif calendar_entity in self.hass.data[DOMAIN]["names"]:
                        self.hass.data[DOMAIN]["names"].pop(calendar_entity, None)
                    
                    if weather:
                        self.hass.data[DOMAIN]["weather_entity"] = weather
                
                # Return with empty data for options (data is stored in config entry data)
                return self.async_create_entry(title="", data={})
            except Exception as err:
                import logging
                _LOGGER = logging.getLogger(__name__)
                _LOGGER.error(f"Error updating config: {err}", exc_info=True)
                return self.async_abort(reason="unknown")

        try:
            current_color = self.config_entry.data.get("color", "#2196f3")
            current_name = self.config_entry.data.get("name", "")
            current_weather = self.config_entry.data.get("weather_entity", "")
            
            # Convert hex to RGB for the color picker
            if current_color and current_color.startswith("#") and len(current_color) == 7:
                try:
                    r = int(current_color[1:3], 16)
                    g = int(current_color[3:5], 16)
                    b = int(current_color[5:7], 16)
                    current_color_rgb = [r, g, b]
                except (ValueError, IndexError):
                    current_color_rgb = [33, 150, 243]  # Default blue
            else:
                current_color_rgb = [33, 150, 243]  # Default blue
            
            calendar_entity = self.config_entry.data.get("calendar_entity", "Unknown")

            return self.async_show_form(
                step_id="init",
                data_schema=vol.Schema({
                    vol.Optional("name", default=current_name): str,
                    vol.Optional("weather_entity", default=current_weather): selector({
                        "entity": {"domain": "weather", "multiple": False}
                    }),
                    vol.Optional("color", default=current_color_rgb): selector({
                        "color_rgb": {}
                    }),
                }),
                description_placeholders={
                    "calendar": calendar_entity,
                },
            )
        except Exception as err:
            import logging
            _LOGGER = logging.getLogger(__name__)
            _LOGGER.error(f"Error showing form: {err}", exc_info=True)
            return self.async_abort(reason="unknown")
