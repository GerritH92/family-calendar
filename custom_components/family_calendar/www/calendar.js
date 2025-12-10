let currentWeekStart;
let calendars = [];
let colors = {};
let names = {};
let weatherEntity = null;
let weatherForecast = [];
let activeFilters = new Set();
let selectedEvent = null;
let editingEvent = null;
let isInitialized = false;
let currentLanguage = 'en';
let currentView = 'week'; // 'month', 'week', or 'workingDays'

// Version identifier for debugging cache issues
console.log('*** CALENDAR.JS VERSION: 2024-12-07-v3.9.0 ***');

// Translation helper function
function t(key) {
    return translations[currentLanguage][key] || translations['en'][key] || key;
}

// Detect language from Home Assistant or browser
function detectLanguage() {
    try {
        // Try to get language from Home Assistant parent window
        if (window.parent && window.parent.document && window.parent.document.documentElement) {
            const hassLang = window.parent.document.documentElement.lang;
            if (hassLang && translations[hassLang.split('-')[0]]) {
                return hassLang.split('-')[0];
            }
        }
    } catch (e) {
        console.log('Could not access parent window language');
    }
    
    // Fallback to browser language, then to English
    const browserLang = navigator.language || navigator.userLanguage;
    if (browserLang) {
        const langCode = browserLang.split('-')[0];
        if (translations[langCode]) {
            return langCode;
        }
    }
    
    // Final fallback to English
    return 'en';
}

// Initialize language
currentLanguage = detectLanguage();
console.log(`Language detected: ${currentLanguage}`);

// Toast notification function
function showToast(message, type = 'success', duration = 3000) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <div class="toast-icon"></div>
        <div class="toast-message">${message}</div>
    `;
    
    container.appendChild(toast);
    
    // Auto remove after duration
    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// Custom confirmation modal
let confirmResolve = null;

function showConfirm(message, title = 'Confirm', actionButtonText = 'Confirm', isDangerous = false) {
    return new Promise((resolve) => {
        confirmResolve = resolve;
        const modal = document.getElementById('confirm-modal');
        const titleElement = document.getElementById('confirm-title');
        const messageElement = document.getElementById('confirm-message');
        const actionButton = document.getElementById('confirm-action-button');
        
        titleElement.textContent = title;
        messageElement.textContent = message;
        actionButton.textContent = actionButtonText;
        
        // Style button based on action type
        if (isDangerous) {
            actionButton.className = 'btn btn-danger';
        } else {
            actionButton.className = 'btn btn-primary';
        }
        
        modal.classList.add('show');
    });
}

function closeConfirmModal(result) {
    const modal = document.getElementById('confirm-modal');
    modal.classList.remove('show');
    if (confirmResolve) {
        confirmResolve(result);
        confirmResolve = null;
    }
}

const API_ENDPOINTS = {
    CONFIG: '/api/family_calendar/config',
    WEATHER: '/api/family_calendar/weather',
    EVENTS: '/api/family_calendar/events',
    ADD_EVENT: '/api/family_calendar/add_event',
    UPDATE_EVENT: '/api/family_calendar/update_event',
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
        filterList.innerHTML = `<div style="color: #999; font-style: italic; padding: 10px;">${t('noCalendarsFound')}</div>`;
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
    renderCalendar();
}

function getMonday(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff));
}

function formatDate(date) {
    // Use local date components to avoid timezone issues
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function previousWeek() {
    if (currentView === 'month') {
        currentWeekStart.setMonth(currentWeekStart.getMonth() - 1);
    } else {
        currentWeekStart.setDate(currentWeekStart.getDate() - 7);
    }
    renderCalendar();
}

function nextWeek() {
    if (currentView === 'month') {
        currentWeekStart.setMonth(currentWeekStart.getMonth() + 1);
    } else {
        currentWeekStart.setDate(currentWeekStart.getDate() + 7);
    }
    renderCalendar();
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

// Switch view function
function switchView(view) {
    currentView = view;
    
    // Update body data attribute for CSS styling
    document.body.setAttribute('data-view', view);
    
    // Update button states
    document.querySelectorAll('.view-toggle-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`[data-view="${view}"]`)?.classList.add('active');
    
    renderCalendar();
}

// Main render function that delegates to specific view renderers
async function renderCalendar() {
    switch(currentView) {
        case 'month':
            await renderMonth();
            break;
        case 'workingDays':
            await renderWorkingDays();
            break;
        case 'week':
        default:
            await renderWeek();
            break;
    }
}

// Render month view
async function renderMonth() {
    const weekGrid = document.getElementById('week-grid');
    if (!weekGrid) {
        debug('week-grid element not found');
        return;
    }
    
    weekGrid.innerHTML = '';
    
    // Get the first day of the month
    const firstDayOfMonth = new Date(currentWeekStart.getFullYear(), currentWeekStart.getMonth(), 1);
    const lastDayOfMonth = new Date(currentWeekStart.getFullYear(), currentWeekStart.getMonth() + 1, 0);
    
    // Find the Monday before or on the first day of the month
    const startDate = getMonday(firstDayOfMonth);
    
    // Calculate how many weeks we need to show
    const daysToShow = [];
    let currentDay = new Date(startDate);
    
    // Show full weeks until we've passed the last day of the month
    while (currentDay <= lastDayOfMonth || currentDay.getDay() !== 1) {
        daysToShow.push(new Date(currentDay));
        currentDay.setDate(currentDay.getDate() + 1);
    }
    
    const fetchStartDate = formatDate(daysToShow[0]);
    const fetchEndDate = formatDate(new Date(daysToShow[daysToShow.length - 1].getTime() + 24*60*60*1000));
    
    const allEvents = [];
    
    // Fetch events in parallel for better performance
    const eventPromises = calendars
        .filter(calendar => activeFilters.has(calendar))
        .map(async calendar => {
            const events = await getEvents(calendar, fetchStartDate, fetchEndDate);
            events.forEach(event => {
                event.calendar = calendar;
                event.color = colors[calendar] || '#2196F3';
            });
            return events;
        });

    const results = await Promise.all(eventPromises);
    results.forEach(events => allEvents.push(...events));
    
    debug(`Total events fetched for month: ${allEvents.length}`);
    
    // Update title
    const monthName = t('months')[firstDayOfMonth.getMonth()];
    const year = firstDayOfMonth.getFullYear();
    const weekTitleEl = document.getElementById('week-title');
    if (weekTitleEl) {
        weekTitleEl.textContent = `${monthName} ${year}`;
    }
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    daysToShow.forEach(day => {
        const dayColumn = document.createElement('div');
        dayColumn.className = 'day-column';
        
        // Mark weekend days
        if (day.getDay() === 0 || day.getDay() === 6) {
            dayColumn.classList.add('weekend');
        }
        
        // Mark days outside current month
        if (day.getMonth() !== firstDayOfMonth.getMonth()) {
            dayColumn.classList.add('other-month');
        }
        
        // Check if it's today
        if (day.getDate() === today.getDate() && 
            day.getMonth() === today.getMonth() && 
            day.getFullYear() === today.getFullYear()) {
            dayColumn.classList.add('today');
        }
        
        const dayName = t('daysShort')[day.getDay()];
        
        const dayHeader = document.createElement('div');
        dayHeader.className = 'day-header';
        dayHeader.innerHTML = `
            <span class="day-name">${dayName}</span>
            <span class="day-number">${day.getDate()}</span>
        `;
        
        dayColumn.appendChild(dayHeader);
        
        const eventsContainer = document.createElement('div');
        eventsContainer.className = 'events-container';
        
        const currentDateStr = formatDate(day);
        
        const dayEvents = allEvents.filter(event => {
            if (event.start.date) {
                // For all-day events, check if current day falls within the event range
                const eventStartDate = event.start.date;
                const eventEndDate = event.end.date;
                return currentDateStr >= eventStartDate && currentDateStr < eventEndDate;
            } else if (event.start.dateTime) {
                // For timed events, extract just the date part without parsing to avoid timezone issues
                const eventDateStr = event.start.dateTime.split('T')[0];
                return eventDateStr === currentDateStr;
            }
            return false;
        });
        
        dayEvents.sort((a, b) => {
            const aTime = a.start.dateTime || a.start.date;
            const bTime = b.start.dateTime || b.start.date;
            return aTime.localeCompare(bTime);
        });
        
        dayEvents.forEach(event => {
            const eventEl = document.createElement('div');
            eventEl.className = 'event';
            eventEl.style.background = getColorTint(event.color, 0.18) || 'var(--primary-light)';
            eventEl.style.borderLeftColor = event.color;
            eventEl.onclick = () => showEventDetails(event);
            
            let timeStr = '';
            if (event.start.dateTime) {
                const startTime = new Date(event.start.dateTime);
                const locale = currentLanguage === 'nl' ? 'nl-NL' : 'en-US';
                timeStr = startTime.toLocaleTimeString(locale, {hour: '2-digit', minute: '2-digit'});
            } else {
                timeStr = t('allDay');
            }
            
            eventEl.innerHTML = `
                <div class="event-time">${timeStr}</div>
                <div class="event-title">${event.summary}</div>
            `;
            
            eventsContainer.appendChild(eventEl);
        });
        
        if (dayEvents.length === 0) {
            const noEvents = document.createElement('div');
            noEvents.className = 'no-events';
            noEvents.textContent = t('noEvents');
            eventsContainer.appendChild(noEvents);
        } else if (dayEvents.length > 3) {
            // Add expand/collapse button for days with many events
            const expandBtn = document.createElement('button');
            expandBtn.className = 'events-expand-btn';
            expandBtn.textContent = `+${dayEvents.length - 3} more`;
            expandBtn.onclick = (e) => {
                e.stopPropagation();
                eventsContainer.classList.toggle('expanded');
                expandBtn.textContent = eventsContainer.classList.contains('expanded') 
                    ? 'Show less' 
                    : `+${dayEvents.length - 3} more`;
            };
            dayColumn.appendChild(expandBtn);
        }
        
        dayColumn.appendChild(eventsContainer);
        weekGrid.appendChild(dayColumn);
    });
}

// Render working days view (Monday-Friday)
async function renderWorkingDays() {
    const weekGrid = document.getElementById('week-grid');
    if (!weekGrid) {
        debug('week-grid element not found');
        return;
    }
    
    weekGrid.innerHTML = '';
    
    const weekDays = [];
    // Only Monday to Friday (0-4 in the week, but we start from Monday)
    for (let i = 0; i < 5; i++) {
        const day = new Date(currentWeekStart);
        day.setDate(day.getDate() + i);
        weekDays.push(day);
    }
    
    const startDate = formatDate(weekDays[0]);
    const endDate = formatDate(new Date(weekDays[4].getTime() + 24*60*60*1000));
    
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
    
    debug(`Total events fetched for working days: ${allEvents.length}`);
    
    const startMonth = t('months')[weekDays[0].getMonth()];
    const endMonth = t('months')[weekDays[4].getMonth()];
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
        
        // Check if it's today
        if (day.getDate() === today.getDate() && 
            day.getMonth() === today.getMonth() && 
            day.getFullYear() === today.getFullYear()) {
            dayColumn.classList.add('today');
        }
        
        const dayName = t('days')[day.getDay()];
        
        // Find weather for this day
        let weatherHtml = '';
        if (weatherForecast.length > 0) {
            const dateStr = formatDate(day);
            const forecast = weatherForecast.find(f => {
                const fDate = f.datetime ? f.datetime.split('T')[0] : null;
                return fDate === dateStr;
            });
            
            if (forecast) {
                const condition = forecast.condition || 'unknown';
                const tempLow = forecast.temperature !== undefined ? Math.round(forecast.temperature) : (forecast.templow !== undefined ? Math.round(forecast.templow) : '?');
                const tempHigh = forecast.temperature !== undefined ? Math.round(forecast.temperature) : (forecast.temperature !== undefined ? Math.round(forecast.temperature) : '?');
                
                const conditionTranslated = t(condition) || condition;
                
                weatherHtml = `
                    <div class="weather-info">
                        <div class="weather-icon weather-${condition}"></div>
                        <div class="weather-temp">${tempLow}° / ${tempHigh}°</div>
                    </div>
                `;
            }
        }
        
        const dayHeader = document.createElement('div');
        dayHeader.className = 'day-header';
        dayHeader.innerHTML = `
            <div class="day-info">
                <div class="day-name">${dayName}</div>
                <div class="day-number">${day.getDate()}</div>
            </div>
            ${weatherHtml}
        `;
        
        dayColumn.appendChild(dayHeader);
        
        const eventsContainer = document.createElement('div');
        eventsContainer.className = 'events-container';
        
        const currentDateStr = formatDate(day);
        
        const dayEvents = allEvents.filter(event => {
            if (event.start.date) {
                // For all-day events, check if current day falls within the event range
                const eventStartDate = event.start.date;
                const eventEndDate = event.end.date;
                return currentDateStr >= eventStartDate && currentDateStr < eventEndDate;
            } else if (event.start.dateTime) {
                // For timed events, extract just the date part without parsing to avoid timezone issues
                const eventDateStr = event.start.dateTime.split('T')[0];
                return eventDateStr === currentDateStr;
            }
            return false;
        });
        
        dayEvents.sort((a, b) => {
            const aTime = a.start.dateTime || a.start.date;
            const bTime = b.start.dateTime || b.start.date;
            return aTime.localeCompare(bTime);
        });
        
        dayEvents.forEach(event => {
            const eventEl = document.createElement('div');
            eventEl.className = 'event';
            eventEl.style.background = getColorTint(event.color, 0.18) || 'var(--primary-light)';
            eventEl.style.borderLeftColor = event.color;
            eventEl.onclick = () => showEventDetails(event);
            
            let timeStr = '';
            if (event.start.dateTime) {
                const startTime = new Date(event.start.dateTime);
                const locale = currentLanguage === 'nl' ? 'nl-NL' : 'en-US';
                timeStr = startTime.toLocaleTimeString(locale, {hour: '2-digit', minute: '2-digit'});
            } else {
                timeStr = t('allDay');
            }
            
            eventEl.innerHTML = `
                <div class="event-time">${timeStr}</div>
                <div class="event-title">${event.summary}</div>
            `;
            
            eventsContainer.appendChild(eventEl);
        });
        
        if (dayEvents.length === 0) {
            const noEvents = document.createElement('div');
            noEvents.className = 'no-events';
            noEvents.textContent = t('noEvents');
            eventsContainer.appendChild(noEvents);
        }
        
        dayColumn.appendChild(eventsContainer);
        weekGrid.appendChild(dayColumn);
    });
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
    
    const startMonth = t('months')[weekDays[0].getMonth()];
    const endMonth = t('months')[weekDays[6].getMonth()];
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
        
        const dayName = t('days')[day.getDay()];
        
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
                // For all-day events, check if current day falls within the event range
                const eventStartDate = event.start.date;
                const eventEndDate = event.end.date;
                return currentDateStr >= eventStartDate && currentDateStr < eventEndDate;
            } else if (event.start.dateTime) {
                // For timed events, extract just the date part without parsing to avoid timezone issues
                const eventDateStr = event.start.dateTime.split('T')[0];
                return eventDateStr === currentDateStr;
            }
            return false;
        });
        
        dayEvents.sort((a, b) => {
            const aTime = a.start.dateTime || a.start.date;
            const bTime = b.start.dateTime || b.start.date;
            return aTime.localeCompare(bTime);
        });
        
        if (dayEvents.length === 0) {
            dayEventsDiv.innerHTML = `<div class="no-events">${t('noEvents')}</div>`;
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
        timeHtml = startDate.toLocaleDateString(currentLanguage === 'nl' ? 'nl-NL' : 'en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        }) + ` (${t('allDay')})`;
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
    // Don't clear selectedEvent immediately - wait a bit in case edit button was clicked
    setTimeout(() => {
        selectedEvent = null;
        selectedEventId = null;
    }, 100);
}

window.deleteSelectedEvent = async function() {
    if (!selectedEvent) {
        showToast(t('noEventSelected'), 'error');
        return;
    }
    if (!selectedEventId) {
        showToast(t('cannotDeleteEvent'), 'error', 4000);
        return;
    }
    
    const confirmed = await showConfirm(
        t('deleteEventConfirm'),
        t('deleteEvent'),
        t('delete'),
        true
    );
    
    if (!confirmed) {
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
            showToast(`Failed to delete event: ${response.status}`, 'error', 5000);
            return;
        }
        
        await response.json();
        showToast(t('eventDeletedSuccess'), 'success');
        closeEventModal();
        await renderCalendar();
    } catch (error) {
        debug('Error deleting event: ' + error.message);
        showToast(t('errorPrefix') + error.message, 'error', 5000);
    }
}

window.editSelectedEvent = function() {
    if (!selectedEvent) {
        console.error('No event selected to edit.');
        showToast(t('noEventToEdit'), 'error');
        return;
    }

    console.log('=== EDIT EVENT BUTTON CLICKED ===');
    console.log('Selected event:', selectedEvent);
    
    // Store a COPY of the event being edited BEFORE closing the modal
    editingEvent = {
        summary: selectedEvent.summary,
        calendar: selectedEvent.calendar,
        description: selectedEvent.description,
        location: selectedEvent.location,
        start: {...selectedEvent.start},
        end: {...selectedEvent.end},
        uid: selectedEvent.uid
    };
    
    console.log('Stored editingEvent copy:', editingEvent);
    
    // Close the event details modal
    closeEventModal();
    
    // Check what modals exist in the DOM
    const allModals = document.querySelectorAll('.modal-overlay');
    console.log('Total modals found in DOM:', allModals.length);
    allModals.forEach((modal, index) => {
        console.log(`Modal ${index + 1}:`, {
            id: modal.id,
            'data-modal-name': modal.getAttribute('data-modal-name'),
            classes: modal.className,
            visible: window.getComputedStyle(modal).display !== 'none'
        });
    });
    
    // Populate calendar dropdown first
    const calendarSelect = document.getElementById('eventCalendar');
    calendarSelect.innerHTML = `<option value="">${t('selectCalendar')}</option>`;
    calendars.forEach(cal => {
        const calName = names[cal] || cal.replace('calendar.', '').replace(/_/g, ' ');
        const option = document.createElement('option');
        option.value = cal;
        option.textContent = calName;
        calendarSelect.appendChild(option);
    });
    
    // Fill in event details
    document.getElementById('eventTitle').value = editingEvent.summary || '';
    document.getElementById('eventCalendar').value = editingEvent.calendar || '';
    document.getElementById('eventDescription').value = editingEvent.description || '';
    document.getElementById('eventLocation').value = editingEvent.location || '';

    // Handle dates and times
    const isAllDay = editingEvent.start.date && !editingEvent.start.dateTime;
    const allDayCheckbox = document.getElementById('eventAllDay');
    allDayCheckbox.checked = isAllDay;
    
    if (isAllDay) {
        // All-day event
        document.getElementById('eventStartDate').value = editingEvent.start.date;
        document.getElementById('eventEndDate').value = editingEvent.end.date;
    } else {
        // Timed event
        const startDate = new Date(editingEvent.start.dateTime);
        const endDate = new Date(editingEvent.end.dateTime);
        document.getElementById('eventStartDate').value = startDate.toISOString().split('T')[0];
        document.getElementById('eventStartTime').value = startDate.toTimeString().slice(0, 5);
        document.getElementById('eventEndDate').value = endDate.toISOString().split('T')[0];
        document.getElementById('eventEndTime').value = endDate.toTimeString().slice(0, 5);
    }
    
    // Call toggleTimeInputs to show/hide time fields
    window.toggleTimeInputs();
    
    // Update modal title and button text
    document.getElementById('add-event-modal-title').textContent = t('editEvent');
    document.getElementById('submit-event-button').textContent = t('updateEvent');
    
    console.log('About to open modal with id: add-event-modal');
    
    // Show the modal
    const modal = document.getElementById('add-event-modal');
    console.log('Modal element:', {
        id: modal.id,
        'data-modal-name': modal.getAttribute('data-modal-name'),
        'before classes': modal.className
    });
    
    modal.classList.add('show');
    
    console.log('After adding .show class:', {
        classes: modal.className,
        display: window.getComputedStyle(modal).display
    });
    
    console.log('=== END EDIT EVENT ===');
}



async function init() {
    if (isInitialized) {
        // Just refresh data, don't re-initialize
        await loadConfig();
        await renderCalendar();
        return;
    }
    
    isInitialized = true;
    currentWeekStart = getMonday(new Date());
    
    // Set initial view attribute on body
    document.body.setAttribute('data-view', currentView);
    
    debug('Initializing Family Calendar v3.4');
    debug('Loading configuration...');
    
    await loadConfig();
    await renderCalendar();
    
    updateLiveClock();
    setInterval(updateLiveClock, 1000);
    
    debug('Calendar initialized successfully');
}

window.openAddEventModal = function() {
    debug('openAddEventModal called');
    
    // Clear editing state
    editingEvent = null;
    
    const modal = document.getElementById('add-event-modal');
    
    if (!modal) {
        debug('ERROR: add-event-modal element not found!');
        return;
    }
    
    debug('Modal element found');
    const calendarSelect = document.getElementById('eventCalendar');
    
    // Populate calendar dropdown
    calendarSelect.innerHTML = `<option value="">${t('selectCalendar')}</option>`;
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
    
    // Reset modal title and button text
    document.getElementById('add-event-modal-title').textContent = t('addNewEvent');
    document.getElementById('submit-event-button').textContent = t('createEvent');
    
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
        editingEvent = null;
        // Reset modal title and button text
        document.getElementById('add-event-modal-title').textContent = t('addNewEvent');
        document.getElementById('submit-event-button').textContent = t('createEvent');
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
        const isEditing = editingEvent !== null;
        debug(isEditing ? 'Updating event in: ' + calendarEntity : 'Creating event in: ' + calendarEntity);

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

        // Build service data
        const serviceData = {
            calendar_entity: calendarEntity,
            summary: title
        };

        // Format start/end times
        if (!isAllDay && startTime && endTime) {
            serviceData.start_date_time = `${startDate} ${startTime}:00`;
            serviceData.end_date_time = `${endDate} ${endTime}:00`;
        } else {
            serviceData.start_date_time = `${startDate} 00:00:00`;
            serviceData.end_date_time = `${endDate} 23:59:59`;
        }

        if (description) {
            serviceData.description = description;
        }

        if (location) {
            serviceData.location = location;
        }

        if (isEditing) {
            // Update existing event
            serviceData.event_uid = editingEvent.uid;
            const response = await fetch(API_ENDPOINTS.UPDATE_EVENT, {
                method: 'POST',
                headers,
                body: JSON.stringify(serviceData),
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to update event');
            }
            
            debug('Event updated successfully');
            showToast(t('eventUpdatedSuccess'), 'success');
        } else {
            // Create new event
            const response = await fetch(API_ENDPOINTS.ADD_EVENT, {
                method: 'POST',
                headers,
                body: JSON.stringify(serviceData),
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to create event');
            }
            
            debug('Event created successfully');
            showToast(t('eventCreatedSuccess'), 'success');
        }

        closeAddEventModal();
        
        // Wait a moment for backend to sync, then refresh
        await new Promise(resolve => setTimeout(resolve, 1000));
        await renderCalendar();
    } catch (error) {
        console.error('Error submitting event:', error);
        showToast('Error: ' + error.message, 'error', 5000);
    }
}

// Wait for DOM to be ready before initializing
// Always fetch events and config on page load/refresh
window.addEventListener('pageshow', function(event) {
    // 'pageshow' fires on normal load and on bfcache restore (back/forward cache)
    // If coming from cache, force a refresh
    if (event.persisted) {
        console.log('Page restored from cache - forcing refresh');
        isInitialized = false;
    }
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
