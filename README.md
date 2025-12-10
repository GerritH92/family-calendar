# Family Calendar for Home Assistant

A beautiful, responsive calendar integration for Home Assistant that aggregates multiple calendars with multiple view modes (Month, Week, Work Week), weather forecasts, and full event management capabilities.

![Version](https://img.shields.io/badge/version-0.0.1-blue)
![HACS](https://img.shields.io/badge/HACS-Custom-orange)

## ✨ Features

### 📅 Multiple View Modes
*   **Month View**: Full month calendar with expandable days showing all events
*   **Week View**: 7-day view with detailed time slots
*   **Work Week View**: Monday-Friday focused view for work schedules

### 🎨 Calendar Management
*   **Unified View**: Aggregate events from multiple Home Assistant calendars (Google, Local, CalDAV, etc.)
*   **Custom Colors**: Assign individual colors to each calendar for easy identification
*   **Friendly Names**: Set custom display names for your calendars
*   **Live Filtering**: Toggle calendars on/off with pill filters

### ⚡ Event Management
*   **Add Events**: Create new events with title, date, time, description, and location
*   **Edit Events**: Modify existing event details
*   **Delete Events**: Remove events directly from the UI
*   **Multi-day Events**: Full support for events spanning multiple days

### 🌤️ Weather Integration
*   Displays daily weather icons and min/max temperatures
*   Configurable weather entity per calendar
*   Integrated into week and work week views

### 📱 User Experience
*   **Responsive Design**: Optimized for desktop, tablets, and mobile devices
*   **Live Clock**: Always-visible current time and date
*   **Compact Events**: Space-efficient event display with expandable details
*   **Month View Optimization**: Full month fits on screen with expandable days
*   **Internationalization**: Support for multiple languages (English, Dutch)

## 📦 Installation

### Option 1: HACS (Recommended)

1.  Open HACS in Home Assistant
2.  Go to **Integrations** > top-right menu (**⋮**) > **Custom repositories**
3.  Add the repository URL: `https://github.com/GerritH92/family-calendar`
4.  Category: **Integration**
5.  Click **Add**, then find "Family Calendar" in the list and install it
6.  Restart Home Assistant

### Option 2: Manual Installation

1.  Download this repository
2.  Copy the `custom_components/family_calendar` folder to your Home Assistant `config/custom_components/` directory
3.  Restart Home Assistant

## ⚙️ Configuration

### Adding Calendar Integrations

1.  Go to **Settings** > **Devices & Services**
2.  Click **+ Add Integration** and search for **Family Calendar**
3.  Follow the setup wizard:
    *   **Calendar Entity**: Select a calendar from your Home Assistant setup
    *   **Display Name**: (Optional) Set a friendly name
    *   **Weather Entity**: (Optional) Select a weather entity for forecasts
    *   **Color**: Choose a color for this calendar's events

4.  Repeat for each calendar you want to add

### Updating Calendar Settings

1.  Go to **Settings** > **Devices & Services** > **Family Calendar**
2.  Click on a configured calendar entry
3.  Click **Configure** to update name, color, or weather entity

### Adding to Dashboard

The Family Calendar is automatically available as a sidebar panel. To add it to your dashboard:

#### Option 1: Sidebar Panel (Automatic)
The calendar is automatically registered and accessible from the Home Assistant sidebar under "Family Calendar"

#### Option 2: Dashboard Card (iFrame)
1.  Edit your Dashboard
2.  Add a **Webpage** card
3.  Set the **URL** to:
    ```
    /family_calendar_static/calendar.html
    ```
4.  (Optional) Set height to `800px` or adjust to your preference

## 🎯 Usage

### Navigation
*   Use **< >** arrows to navigate between weeks/months
*   Click view toggle buttons to switch between Month, Week, and Work Week views

### Viewing Events
*   Click any event to view full details (time, location, description)
*   Multi-day events are displayed across all relevant days
*   Color-coded events match your calendar configuration

### Managing Events
*   **Add Event**: Click the **+ Add Event** button
*   **Edit Event**: Click an event, then click **Edit Event**
*   **Delete Event**: Click an event, then click **Delete Event**

### Filtering Calendars
*   Use the calendar pills below the header to show/hide specific calendars
*   Changes are saved and persist across sessions

### Month View Features
*   Days show abbreviated day names with date numbers
*   Events are collapsed to show first 3, with "+X more" button to expand
*   Today's date is highlighted
*   Click expandable days to see all events

## 🛠️ Supported Calendar Integrations

*   Google Calendar
*   Local Calendar
*   CalDAV
*   Any Home Assistant calendar entity

## 🐛 Troubleshooting

### Events Not Showing
*   Ensure the calendar entity is properly configured in Home Assistant
*   Check that the calendar has read permissions
*   Verify date/time settings are correct

### Cannot Add/Edit/Delete Events
*   Verify the calendar supports write operations
*   For Google Calendar, ensure the integration has write permissions
*   Check Home Assistant logs for specific errors

### Config Flow Error (500)
*   Restart Home Assistant after installation
*   Check `config_flow.py` is properly installed in `custom_components/family_calendar/`
*   Review Home Assistant logs for detailed error messages

## 📝 Development

### Local Testing with Docker

1.  Navigate to `.dev` directory
2.  Run `docker compose up -d`
3.  Access Home Assistant at `http://localhost:8123`
4.  Install and configure Family Calendar
5.  Make changes to files in `custom_components/family_calendar/`
6.  Copy updated files to `.dev/data/custom_components/family_calendar/`
7.  Restart container: `docker compose restart`

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

This project is provided as-is for use with Home Assistant.

## 🙏 Credits

Built for Home Assistant by GerritH92
