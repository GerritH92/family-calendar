# Translation Guide

The Family Calendar integration supports multiple languages. Currently supported:
- **English (en)** - Default
- **Dutch (nl)**

## How It Works

1. **Auto-detection**: The calendar automatically detects the language from:
   - Home Assistant's language setting (primary)
   - Browser language (fallback)

2. **Translation System**: All user-facing text is stored in the `translations` object in `calendar.js`

## Adding a New Language

To add support for a new language (e.g., German 'de'):

1. Open `custom_components/family_calendar/www/calendar.js`

2. Find the `translations` object (around line 15)

3. Add your language code and translations after the existing languages:

```javascript
const translations = {
    en: { /* existing English translations */ },
    nl: { /* existing Dutch translations */ },
    de: {  // NEW LANGUAGE
        // Days
        days: ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'],
        // Months
        months: ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'],
        // UI labels
        calendars: 'Kalender',
        noCalendarsFound: 'Keine Kalender gefunden',
        noEvents: 'Keine Ereignisse',
        allDay: 'Ganztägig',
        loading: 'Laden...',
        // Buttons
        addEvent: '+ Ereignis hinzufügen',
        cancel: 'Abbrechen',
        delete: 'Löschen',
        // ... add all other translation keys
    }
};
```

4. **Translation Keys**: Make sure to include ALL translation keys that exist in the `en` and `nl` objects. Missing keys will fall back to English.

## Translation Keys Reference

### Days and Time
- `days` - Array of 7 day names (Sunday-Saturday)
- `months` - Array of 12 month names
- `allDay` - Text for all-day events

### UI Labels
- `calendars` - Calendar filter section label
- `noCalendarsFound` - Message when no calendars available
- `noEvents` - Message when a day has no events
- `loading` - Loading indicator text

### Buttons
- `addEvent` - Add event button text
- `cancel` - Cancel button
- `delete` - Delete button
- `confirm` - Confirm button
- `edit` - Edit button
- `save` - Save button
- `createEvent` - Create event submit button
- `updateEvent` - Update event submit button

### Modal Titles
- `addNewEvent` - Add event modal title
- `editEvent` - Edit event modal title
- `deleteEvent` - Delete confirmation modal title
- `eventDetails` - Event details modal title

### Form Labels
- `title` - Event title field
- `calendar` - Calendar selector field
- `selectCalendar` - Calendar dropdown placeholder
- `startDate` - Start date field
- `startTime` - Start time field
- `endDate` - End date field
- `endTime` - End time field
- `allDayEvent` - All day toggle label
- `description` - Description field
- `location` - Location field

### Placeholders
- `enterEventTitle` - Title input placeholder
- `enterEventDescription` - Description textarea placeholder
- `enterEventLocation` - Location input placeholder

### Messages
- `eventCreatedSuccess` - Success message after creating
- `eventUpdatedSuccess` - Success message after updating
- `eventDeletedSuccess` - Success message after deleting
- `noEventSelected` - Error when no event selected
- `cannotDeleteEvent` - Error when event can't be deleted
- `deleteEventConfirm` - Confirmation question for delete
- `failedToDeleteEvent` - Error message on delete failure
- `noEventToEdit` - Error when no event to edit
- `errorPrefix` - Prefix for error messages (e.g., "Error: ")

### Weather Conditions
- `clear-night`, `cloudy`, `fog`, `hail`, `lightning`, `lightning-rainy`, `partlycloudy`, `pouring`, `rainy`, `snowy`, `snowy-rainy`, `sunny`, `windy`, `windy-variant`, `exceptional`

## Testing Your Translation

1. Set your Home Assistant language to the new language code
2. Or set your browser language to test
3. Clear browser cache (Cmd+Shift+R / Ctrl+F5)
4. Reload the calendar

## Contributing Translations

If you add a translation, please consider contributing it back to the project:
1. Fork the repository
2. Add your translation to `calendar.js`
3. Test thoroughly
4. Submit a pull request

Thank you for helping make Family Calendar multilingual! 🌍
