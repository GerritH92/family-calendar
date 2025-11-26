let currentWeekStart;
let calendars = [];
let colors = {};
let names = {};
let weatherEntity = null;
let weatherForecast = [];
let activeFilters = new Set();
let selectedEvent = null;

const API_ENDPOINTS = {
    CONFIG: '/api/family_calendar/config',
    WEATHER: '/api/family_calendar/weather',
    EVENTS: '/api/family_calendar/events',
    ADD_EVENT: '/api/family_calendar/add_event',
    DELETE_EVENT: '/api/family_calendar/delete_event'
};

const WEATHER_ICONS = {
    'clear-night': '🌙',
    'cloudy': '☁️',
    'fog': '🌫️',
    'hail': '🌨️',
    'lightning': '🌩️',
    'lightning-rainy': '⛈️',
    'partlycloudy': '⛅',
    'pouring': '🌧️',
    'rainy': '🌧️',
    'snowy': '❄️',
    'snowy-rainy': '🌨️',
    'sunny': '☀️',
    'windy': '💨',
    'windy-variant': '💨',
    'exceptional': '⚠️'
};
let selectedEventId = null;

function debug(message) {
    // Debug logging disabled for production
}

function getColorTint(color, alpha = 0.18) {
    if (!color) {
        return `rgba(33, 150, 243, ${alpha})`;
    }
    if (color.startsWith('#')) {
        let hex = color.slice(1);
        if (hex.length === 3) {
            hex = hex.split('').map(ch => ch + ch).join('');
        }
        if (hex.length === 6) {
            const r = parseInt(hex.substring(0, 2), 16);
            const g = parseInt(hex.substring(2, 4), 16);
            const b = parseInt(hex.substring(4, 6), 16);
            if ([r, g, b].every(v => !Number.isNaN(v))) {
                return `rgba(${r}, ${g}, ${b}, ${alpha})`;
            }
        }
    }
    return color;
}

function ensurePillLayout() {
    // Hide legacy filter container if it still exists
    const legacyFilters = document.getElementById('filters');
    if (legacyFilters) {
        legacyFilters.style.display = 'none';
    }

    // Ensure the new pill container is present above the week grid
    let pillContainer = document.querySelector('.calendar-pills');
    if (!pillContainer) {
        const weekGrid = document.getElementById('week-grid');
        if (!weekGrid || !weekGrid.parentNode) {
            return;
        }
        pillContainer = document.createElement('div');
        pillContainer.className = 'calendar-pills';
        pillContainer.innerHTML = `
            <div class="pills-label">Calendars</div>
            <div class="pill-list" id="filterList"></div>
        `;
        weekGrid.parentNode.insertBefore(pillContainer, weekGrid);
    }

    // Make sure we have a pill list target even if the new markup isn't in the HTML
    let pillList = document.getElementById('filterList');
    if (!pillList) {
        pillList = document.createElement('div');
        pillList.id = 'filterList';
        pillList.className = 'pill-list';
        pillContainer.appendChild(pillList);
    }
}

function getEventIdentifier(event) {
    if (!event) {
        return null;
    }
    return event.uid || event.event_id || event.id || null;
}

function ensureEventIdentifier(event) {
    if (!event) {
        return;
    }
    if (!event.uid && event.event_id) {
        event.uid = event.event_id;
    }
    if (!event.uid && event.id) {
        event.uid = event.id;
    }
}

function hasEventIdentifier(event) {
    return Boolean(getEventIdentifier(event));
}

function updateLiveClock() {
    const now = new Date();
    const timeString = now.toLocaleTimeString('nl-NL', {
        hour: '2-digit',
        minute: '2-digit'
    });
    const dateString = now.toLocaleDateString('nl-NL', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
    
    const timeEl = document.getElementById('live-time');
    const dateEl = document.getElementById('live-date');
    
    if (timeEl) timeEl.textContent = timeString;
    if (dateEl) dateEl.textContent = dateString;
}

async function loadConfig() {
    try {
        debug(`Fetching config from ${API_ENDPOINTS.CONFIG}...`);
        
        const token = await getAuthToken();
        const headers = {};
        if (token && token !== 'USE_SESSION') {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const response = await fetch(API_ENDPOINTS.CONFIG, { 
            headers,
            credentials: 'include'
        });
        
        if (!response.ok) {
            debug(`Config API error: ${response.status} ${response.statusText}`);
            return;
        }
        
        const data = await response.json();
        debug(`Config response: ${JSON.stringify(data)}`);
        
        calendars = data.calendars || [];
        colors = data.colors || {};
        names = data.names || {};
        weatherEntity = data.weather_entity;
        
        debug(`Calendars loaded: ${calendars.length}`);
        if (weatherEntity) {
            debug(`Weather entity: ${weatherEntity}`);
            await fetchWeather();
        }
        
        calendars.forEach(cal => {
            activeFilters.add(cal);
            debug(`  - ${cal} (color: ${colors[cal]}, name: ${names[cal]})`);
        });
        
        renderFilters();
        debug(`Loaded ${calendars.length} calendars`);
    } catch (error) {
        debug('Error loading config: ' + error.message);
        debug('Stack: ' + error.stack);
    }
}

async function fetchWeather() {
    if (!weatherEntity) return;
    
    try {
        debug('Fetching weather forecast...');
        
        const token = await getAuthToken();
        const headers = {};
        if (token && token !== 'USE_SESSION') {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const response = await fetch(API_ENDPOINTS.WEATHER, { 
            headers,
            credentials: 'include'
        });
        
        if (!response.ok) {
            debug(`Weather API error: ${response.status}`);
            return;
        }
        
        weatherForecast = await response.json();
        debug(`Weather forecast loaded: ${weatherForecast.length} days`);
    } catch (error) {
        debug('Error loading weather: ' + error.message);
    }
}

function renderFilters() {
    ensurePillLayout();
    const filterList = document.getElementById('filterList');
    if (!filterList) {
        debug('filterList element not found');
        return;
    }
    
    debug(`Rendering ${calendars.length} filters`);
    filterList.innerHTML = '';
    
    if (calendars.length === 0) {
        filterList.innerHTML = '<div style="color: #999; font-style: italic; padding: 10px;">No calendars found</div>';
        return;
    }
    
    calendars.forEach(calendar => {
        const color = colors[calendar] || '#2196F3';
        const isActive = activeFilters.has(calendar);
        const calendarName = names[calendar] || calendar.replace('calendar.', '').replace(/_/g, ' ');
        
        debug(`Creating filter pill for: ${calendar}`);
        
        const pill = document.createElement('button');
        pill.type = 'button';
        pill.className = 'calendar-pill';
        if (!isActive) {
            pill.classList.add('inactive');
        }
        
        pill.style.borderColor = color;
        pill.style.color = color;
        pill.style.background = getColorTint(color) || 'var(--surface)';
        
        pill.innerHTML = `
            <span class="pill-dot" style="background:${color};"></span>
            <span>${calendarName}</span>
        `;
        
        pill.addEventListener('click', () => toggleFilter(calendar));
        filterList.appendChild(pill);
    });
    
    debug('Filters rendered successfully');
}

function toggleFilter(calendar) {
    if (activeFilters.has(calendar)) {
        activeFilters.delete(calendar);
    } else {
        activeFilters.add(calendar);
    }
    renderFilters();
    renderWeek();
}

function getMonday(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff));
}

function formatDate(date) {
    return date.toISOString().split('T')[0];
}

function previousWeek() {
    currentWeekStart.setDate(currentWeekStart.getDate() - 7);
    renderWeek();
}

function nextWeek() {
    currentWeekStart.setDate(currentWeekStart.getDate() + 7);
    renderWeek();
}

async function getAuthToken() {
    return new Promise((resolve) => {
        try {
            // Method 1: Try parent window localStorage (web browser)
            try {
                const token = window.parent.localStorage.getItem('hassTokens');
                if (token) {
                    const parsed = JSON.parse(token);
                    resolve(parsed.access_token);
                    return;
                }
            } catch (e) {
                debug('Parent localStorage failed: ' + e.message);
            }
            
            // Method 2: Try direct localStorage
            try {
                const token = localStorage.getItem('hassTokens');
                if (token) {
                    const parsed = JSON.parse(token);
                    resolve(parsed.access_token);
                    return;
                }
            } catch (e) {
                debug('Direct localStorage failed: ' + e.message);
            }
            
            // Method 3: Use session-based auth
            resolve('USE_SESSION');
        } catch (e) {
            debug('Error getting token: ' + e.message);
            resolve('USE_SESSION');
        }
    });
}

async function fetchDirectEvents(calendarEntity, startDate, endDate, token) {
    debug(`Fetching events for ${calendarEntity} with token`);
    const response = await fetch(
        `/api/calendars/${calendarEntity}?start=${startDate}&end=${endDate}`,
        {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        }
    );
    
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const events = await response.json();
    events.forEach(ensureEventIdentifier);
    debug(`Fetched ${events.length} events from ${calendarEntity} (direct)`);
    return events;
}

async function fetchProxyEvents(calendarEntity, startDate, endDate) {
    debug(`Fetching events for ${calendarEntity} via proxy`);
    
    const token = await getAuthToken();
    const headers = {};
    if (token && token !== 'USE_SESSION') {
        headers['Authorization'] = `Bearer ${token}`;
    }

    // Add cache-busting parameter to ensure fresh data
    const cacheBuster = `cb=${Date.now()}`;
    const url = `${API_ENDPOINTS.EVENTS}?calendar=${encodeURIComponent(calendarEntity)}&start=${encodeURIComponent(startDate)}&end=${encodeURIComponent(endDate)}&${cacheBuster}`;
    const response = await fetch(
        url,
        { 
            headers,
            credentials: 'include'
        }
    );
    
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const events = await response.json();
    events.forEach(ensureEventIdentifier);
    debug(`Fetched ${events.length} events from ${calendarEntity} via proxy`);
    return events;
}

async function getEvents(calendarEntity, startDate, endDate) {
    try {
        const token = localStorage.getItem('hassTokens') 
            ? JSON.parse(localStorage.getItem('hassTokens')).access_token 
            : null;
        
        let events = [];
        let usedDirectSource = false;
        
        if (token) {
            try {
                events = await fetchDirectEvents(calendarEntity, startDate, endDate, token);
                usedDirectSource = true;
            } catch (directError) {
                debug(`Direct calendar API failed: ${directError.message}`);
            }
        } else {
            debug('No auth token found; skipping direct calendar API');
        }
        
        if (!events.length || !events.some(hasEventIdentifier)) {
            if (usedDirectSource && events.length && !events.some(hasEventIdentifier)) {
                debug('Direct events missing identifiers; falling back to proxy for delete support');
            }
            events = await fetchProxyEvents(calendarEntity, startDate, endDate);
        }
        
        return events;
    } catch (error) {
        debug(`Error fetching events from ${calendarEntity}: ${error.message}`);
        return [];
    }
}

async function renderWeek() {
    const weekGrid = document.getElementById('week-grid');
    if (!weekGrid) {
        debug('week-grid element not found');
        return;
    }
    
    weekGrid.innerHTML = '';
    
    const weekDays = [];
    for (let i = 0; i < 7; i++) {
        const day = new Date(currentWeekStart);
        day.setDate(day.getDate() + i);
        weekDays.push(day);
    }
    
    const startDate = formatDate(weekDays[0]);
    const endDate = formatDate(new Date(weekDays[6].getTime() + 24*60*60*1000));
    
    const allEvents = [];
    
    // Fetch events in parallel for better performance
    const eventPromises = calendars
        .filter(calendar => activeFilters.has(calendar))
        .map(async calendar => {
            const events = await getEvents(calendar, startDate, endDate);
            events.forEach(event => {
                event.calendar = calendar;
                event.color = colors[calendar] || '#2196F3';
            });
            return events;
        });

    const results = await Promise.all(eventPromises);
    results.forEach(events => allEvents.push(...events));
    
    debug(`Total events fetched: ${allEvents.length}`);
    
    const monthNames = ["januari", "februari", "maart", "april", "mei", "juni",
                       "juli", "augustus", "september", "oktober", "november", "december"];
    const startMonth = monthNames[weekDays[0].getMonth()];
    const endMonth = monthNames[weekDays[6].getMonth()];
    const year = weekDays[0].getFullYear();
    
    const weekTitle = startMonth === endMonth 
        ? `${startMonth} ${year}`
        : `${startMonth} - ${endMonth} ${year}`;
    
    const weekTitleEl = document.getElementById('week-title');
    if (weekTitleEl) {
        weekTitleEl.textContent = weekTitle;
    }
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    weekDays.forEach(day => {
        const dayColumn = document.createElement('div');
        dayColumn.className = 'day-column';
        
        if (day.getDay() === 0 || day.getDay() === 6) {
            dayColumn.classList.add('weekend');
        }
        
        // Check if it's today (ignoring time)
        if (day.getDate() === today.getDate() && 
            day.getMonth() === today.getMonth() && 
            day.getFullYear() === today.getFullYear()) {
            dayColumn.classList.add('today');
        }
        
        const dayNames = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];
        const dayName = dayNames[day.getDay()];
        
        // Find weather for this day
        let weatherHtml = '';
        if (weatherForecast.length > 0) {
            const dateStr = formatDate(day);
            const forecast = weatherForecast.find(f => {
                // Handle both datetime (ISO) and date strings
                const fDate = f.datetime ? f.datetime.split('T')[0] : null;
                return fDate === dateStr;
            });
            
            if (forecast) {
                const icon = WEATHER_ICONS[forecast.condition] || '❓';
                const maxTemp = Math.round(forecast.temperature);
                const minTemp = forecast.templow !== undefined ? Math.round(forecast.templow) : null;
                
                let tempStr = `${maxTemp}°`;
                if (minTemp !== null) {
                    tempStr = `${maxTemp}° / ${minTemp}°`;
                }

                weatherHtml = `
                    <div class="weather-info">
                        <span class="weather-icon" title="${forecast.condition}">${icon}</span>
                        <span class="weather-temp">${tempStr}</span>
                    </div>
                `;
            }
        }
        
        dayColumn.innerHTML = `
            <div class="day-header">
                <div class="day-name">${dayName}</div>
                <div class="day-number-row">
                    <div class="day-number">${day.getDate()}</div>
                    ${weatherHtml}
                </div>
            </div>
            <div class="day-events"></div>
        `;
        
        const dayEventsDiv = dayColumn.querySelector('.day-events');
        const currentDateStr = formatDate(day);
        
        const dayEvents = allEvents.filter(event => {
            if (event.start.date) {
                return event.start.date === currentDateStr;
            } else if (event.start.dateTime) {
                const eventDate = new Date(event.start.dateTime);
                return formatDate(eventDate) === currentDateStr;
            }
            return false;
        });
        
        dayEvents.sort((a, b) => {
            const aTime = a.start.dateTime || a.start.date;
            const bTime = b.start.dateTime || b.start.date;
            return aTime.localeCompare(bTime);
        });
        
        if (dayEvents.length === 0) {
            dayEventsDiv.innerHTML = '<div class="no-events">Geen afspraken</div>';
        } else {
            dayEvents.forEach(event => {
                const eventDiv = document.createElement('div');
                eventDiv.className = 'event';
                eventDiv.style.background = getColorTint(event.color, 0.18) || 'var(--primary-light)';
                eventDiv.style.borderLeftColor = event.color;
                eventDiv.onclick = () => showEventDetails(event);
                
                let timeStr = '';
                if (event.start.dateTime) {
                    const startTime = new Date(event.start.dateTime);
                    const endTime = new Date(event.end.dateTime);
                    timeStr = `<div class="event-time">${startTime.toLocaleTimeString('nl-NL', {hour: '2-digit', minute: '2-digit'})} - ${endTime.toLocaleTimeString('nl-NL', {hour: '2-digit', minute: '2-digit'})}</div>`;
                }
                
                eventDiv.innerHTML = `
                    ${timeStr}
                    <div class="event-title">${event.summary || 'Geen titel'}</div>
                `;
                
                dayEventsDiv.appendChild(eventDiv);
            });
        }
        
        weekGrid.appendChild(dayColumn);
    });
}

function showEventDetails(event) {
    const modal = document.getElementById('event-modal');
    const overlay = document.getElementById('modal-overlay');
    selectedEvent = event;
    selectedEventId = getEventIdentifier(event);
    
    document.getElementById('modal-event-title').textContent = event.summary || 'Geen titel';
    
    let timeHtml = '';
    if (event.start.dateTime) {
        const startTime = new Date(event.start.dateTime);
        const endTime = new Date(event.end.dateTime);
        timeHtml = `${startTime.toLocaleString('nl-NL', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        })} - ${endTime.toLocaleTimeString('nl-NL', {hour: '2-digit', minute: '2-digit'})}`;
    } else if (event.start.date) {
        const startDate = new Date(event.start.date + 'T00:00:00');
        timeHtml = startDate.toLocaleDateString('nl-NL', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        }) + ' (hele dag)';
    }
    document.getElementById('modal-event-time').textContent = timeHtml;
    
    const calendarBadge = document.getElementById('modal-event-calendar');
    const calendarName = names[event.calendar] || event.calendar.replace('calendar.', '').replace(/_/g, ' ');
    calendarBadge.textContent = calendarName;
    calendarBadge.style.background = getColorTint(event.color, 0.25) || 'var(--primary-light)';
    calendarBadge.style.color = event.color;
    calendarBadge.style.borderColor = event.color;
    
    const locationDiv = document.getElementById('modal-event-location-field');
    if (event.location) {
        locationDiv.style.display = 'block';
        document.getElementById('modal-event-location').textContent = event.location;
    } else {
        locationDiv.style.display = 'none';
    }
    
    const descDiv = document.getElementById('modal-event-description-field');
    if (event.description) {
        descDiv.style.display = 'block';
        document.getElementById('modal-event-description').textContent = event.description;
    } else {
        descDiv.style.display = 'none';
    }
    
    const deleteBtn = document.getElementById('modal-delete-button');
    if (deleteBtn) {
        deleteBtn.disabled = !selectedEventId;
        deleteBtn.title = selectedEventId
            ? ''
            : 'This calendar did not provide an event identifier, so it cannot be deleted.';
    }
    
    overlay.classList.add('show');
}

function closeEventModal() {
    document.getElementById('modal-overlay').classList.remove('show');
    selectedEvent = null;
    selectedEventId = null;
}

window.deleteSelectedEvent = async function() {
    if (!selectedEvent) {
        alert('No event selected.');
        return;
    }
    if (!selectedEventId) {
        alert('This event cannot be deleted because no identifier was provided by the calendar.');
        return;
    }
    if (!confirm('Are you sure you want to delete this event?')) {
        return;
    }
    
    try {
        debug(`Deleting event ${selectedEventId} from ${selectedEvent.calendar}`);
        const token = await getAuthToken();
        const headers = {
            'Content-Type': 'application/json',
        };
        
        if (token && token !== 'USE_SESSION') {
            headers['Authorization'] = `Bearer ${token}`;
        }
        
        const response = await fetch(API_ENDPOINTS.DELETE_EVENT, {
            method: 'POST',
            headers,
            credentials: 'include',
            body: JSON.stringify({
                calendar_entity: selectedEvent.calendar,
                event_uid: selectedEventId,
                event_id: selectedEventId,
            }),
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            debug(`Delete failed: ${response.status} - ${errorText}`);
            alert('Failed to delete event: ' + response.status + '\n' + errorText);
            return;
        }
        
        await response.json();
        alert('Event deleted successfully.');
        closeEventModal();
        await renderWeek();
    } catch (error) {
        debug('Error deleting event: ' + error.message);
        alert('Error deleting event: ' + error.message);
    }
}

async function init() {
    currentWeekStart = getMonday(new Date());
    
    debug('Initializing Family Calendar v3.4');
    debug('Loading configuration...');
    
    await loadConfig();
    await renderWeek();
    
    updateLiveClock();
    setInterval(updateLiveClock, 1000);
    
    debug('Calendar initialized successfully');
}

window.openAddEventModal = function() {
    debug('openAddEventModal called');
    const modal = document.getElementById('add-event-modal');
    
    if (!modal) {
        debug('ERROR: add-event-modal element not found!');
        return;
    }
    
    debug('Modal element found');
    const calendarSelect = document.getElementById('eventCalendar');
    
    // Populate calendar dropdown
    calendarSelect.innerHTML = '<option value="">Select a calendar</option>';
    calendars.forEach(cal => {
        const calName = names[cal] || cal.replace('calendar.', '').replace(/_/g, ' ');
        const option = document.createElement('option');
        option.value = cal;
        option.textContent = calName;
        calendarSelect.appendChild(option);
    });
    
    debug(`Populated ${calendars.length} calendars in dropdown`);
    
    // Set default dates and times
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    
    // Default start time: next full hour
    const nextHour = new Date(now);
    nextHour.setHours(now.getHours() + 1, 0, 0, 0);
    const startTimeStr = nextHour.toTimeString().slice(0, 5);
    
    // Default end time: start time + 1 hour
    const endHour = new Date(nextHour);
    endHour.setHours(nextHour.getHours() + 1);
    const endTimeStr = endHour.toTimeString().slice(0, 5);
    
    document.getElementById('eventStartDate').value = todayStr;
    document.getElementById('eventEndDate').value = todayStr;
    document.getElementById('eventStartTime').value = startTimeStr;
    document.getElementById('eventEndTime').value = endTimeStr;
    
    // Reset All Day toggle
    document.getElementById('eventAllDay').checked = false;
    toggleTimeInputs();
    
    debug('Adding show class to modal');
    modal.classList.add('show');
    debug('Modal should now be visible');
}

window.toggleTimeInputs = function() {
    const isAllDay = document.getElementById('eventAllDay').checked;
    const startTimeGroup = document.getElementById('startTimeGroup');
    const endTimeGroup = document.getElementById('endTimeGroup');
    
    if (isAllDay) {
        startTimeGroup.style.display = 'none';
        endTimeGroup.style.display = 'none';
    } else {
        startTimeGroup.style.display = 'block';
        endTimeGroup.style.display = 'block';
    }
}

window.updateEndDate = function() {
    const start = document.getElementById('eventStartDate').value;
    const end = document.getElementById('eventEndDate');
    if (start > end.value) {
        end.value = start;
    }
}

window.updateEndTime = function() {
    const startTime = document.getElementById('eventStartTime').value;
    const endTimeInput = document.getElementById('eventEndTime');
    
    if (startTime && !endTimeInput.value) {
        const [hours, minutes] = startTime.split(':').map(Number);
        const date = new Date();
        date.setHours(hours + 1, minutes);
        endTimeInput.value = date.toTimeString().slice(0, 5);
    }
}

window.closeAddEventModal = function() {
    debug('closeAddEventModal called');
    const modal = document.getElementById('add-event-modal');
    if (modal) {
        modal.classList.remove('show');
        document.getElementById('addEventForm').reset();
    }
}

window.submitEvent = async function(event) {
    event.preventDefault();
    
    const calendarEntity = document.getElementById('eventCalendar').value;
    const title = document.getElementById('eventTitle').value;
    const startDate = document.getElementById('eventStartDate').value;
    const startTime = document.getElementById('eventStartTime').value;
    const endDate = document.getElementById('eventEndDate').value;
    const endTime = document.getElementById('eventEndTime').value;
    const description = document.getElementById('eventDescription').value;
    const location = document.getElementById('eventLocation').value;
    const isAllDay = document.getElementById('eventAllDay').checked;
    
    try {
        debug('Creating event in: ' + calendarEntity);
        
        // Get authentication token
        const token = await getAuthToken();
        const headers = {
            'Content-Type': 'application/json',
        };
        
        if (token && token !== 'USE_SESSION') {
            headers['Authorization'] = `Bearer ${token}`;
            debug('Using Bearer token for authentication');
        } else {
            debug('Using session credentials');
        }
        
        // Build service data - Google Calendar format via Home Assistant
        const serviceData = {
            entity_id: calendarEntity,
            summary: title
        };
        
        // Format start/end for Google Calendar
        if (!isAllDay && startTime && endTime) {
            // Timed event - use start_date_time and end_date_time
            serviceData.start_date_time = `${startDate} ${startTime}:00`;
            serviceData.end_date_time = `${endDate} ${endTime}:00`;
        } else {
            // All-day event - use start_date and end_date
            serviceData.start_date = startDate;
            serviceData.end_date = endDate;
        }
        
        if (description) serviceData.description = description;
        if (location) serviceData.location = location;
        
        // Use family_calendar add_event API endpoint
        const payload = {
            calendar_entity: calendarEntity,
            summary: title,
            ...(description && { description }),
            ...(location && { location })
        };

        if (!isAllDay && startTime && endTime) {
            payload.start_date_time = `${startDate} ${startTime}:00`;
            payload.end_date_time = `${endDate} ${endTime}:00`;
        } else {
            // For all-day events, the API expects start_date_time/end_date_time 
            // but we can pass just the date part if the backend supports it, 
            // OR we pass 00:00:00 / 23:59:59 if we want to force it via datetime.
            // However, the backend logic (FamilyCalendarAddEventView) currently expects start_date_time/end_date_time strings.
            // Let's send date + default times to satisfy the current backend validation, 
            // but ideally the backend should handle date-only.
            // Wait, the backend tries to parse it.
            // Let's stick to the current working logic:
            payload.start_date_time = `${startDate} 00:00:00`;
            // For all day, end date is usually inclusive in UI but exclusive in some APIs.
            // Google Calendar API for all-day is YYYY-MM-DD.
            // Our backend tries google.create_event with start_date_time first.
            // If we want true all-day, we might need to update the backend to accept start_date/end_date.
            // For now, let's send 00:00 to 23:59 which usually works as "all day" visually in many views,
            // or let's rely on the backend's fallback logic.
            
            // Actually, looking at the backend code:
            // It takes start_date_time and end_date_time.
            // Then it tries google.create_event with those.
            // If that fails, it tries calendar.create_event.
            
            // If we want a TRUE all-day event, we should probably update the backend to accept start_date/end_date
            // OR we send the time as 00:00:00 and 23:59:59?
            // Let's stick to what was working before for "all day" (which was just omitting time).
            // But wait, the previous code did:
            // start_date_time: `${startDate} ${startTime || '00:00'}:00`,
            // end_date_time: `${endDate} ${endTime || '23:59'}:00`,
            
            // So if isAllDay is true, we just do that:
            payload.start_date_time = `${startDate} 00:00:00`;
            // Note: Some calendars treat 00:00 to 00:00 next day as all day.
            // Let's use the previous logic which seemed to work for the user.
            payload.end_date_time = `${endDate} 23:59:59`; 
        }

        const response = await fetch(API_ENDPOINTS.ADD_EVENT, {
            method: 'POST',
            headers: headers,
            credentials: 'include',
            body: JSON.stringify(payload)
        });
        
        debug('Called family_calendar add_event API with calendar: ' + calendarEntity);
        
        if (!response.ok) {
            const errorText = await response.text();
            debug('API error: ' + response.status + ' - ' + errorText);
            alert('Failed to create event: ' + response.status + '\n' + errorText);
            return;
        }
        
        const result = await response.json();
        debug('Event created successfully: ' + JSON.stringify(result));
        alert('Event created successfully!');
        
        window.closeAddEventModal();
        
        // Refresh calendar after a short delay
        setTimeout(async () => {
            await renderWeek();
        }, 1500);
        
    } catch (error) {
        debug('Error creating event: ' + error.message);
        alert('Error creating event: ' + error.message);
    }
}

// Wait for DOM to be ready before initializing
// Always fetch events and config on page load/refresh
window.addEventListener('pageshow', function(event) {
    // 'pageshow' fires on normal load and on bfcache restore (back/forward cache)
    init();
});

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    // DOM is already ready
    init();
}

// Auto-refresh every 1 minute (60000 ms)
setInterval(() => {
    debug('Auto-refresh: fetching latest config and events');
    init();
}, 60000);
