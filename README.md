# Family Calendar for Home Assistant

A beautiful, responsive weekly calendar view for Home Assistant that aggregates multiple calendars, shows weather forecasts, and allows adding and deleting events directly from the dashboard.

![Version](https://img.shields.io/badge/version-0.0.1-blue)
![HACS](https://img.shields.io/badge/HACS-Custom-orange)

## Features

*   **Unified View**: Aggregate events from multiple Home Assistant calendars (Google, Local, CalDAV, etc.) into a single weekly view.
*   **Interactive**:
    *   **Add Events**: Create new events with title, time, description, and location.
    *   **Delete Events**: Remove events directly from the UI.
    *   **Filter**: Toggle specific calendars on/off using the pill filters.
*   **Weather Integration**: Displays daily weather icons and min/max temperatures (requires a weather entity).
*   **Responsive Design**: Works great on desktop, tablets, and mobile devices.
*   **Live Clock**: Always visible current time and date.
*   **Customizable**: Assign custom colors and friendly names to your calendars during configuration.

## Installation

### Option 1: HACS (Recommended)

1.  Open HACS in Home Assistant.
2.  Go to **Integrations** > top-right menu (**⋮**) > **Custom repositories**.
3.  Add the URL of this repository.
4.  Category: **Integration**.
5.  Click **Add**, then find "Family Calendar" in the list and install it.
6.  Restart Home Assistant.

### Option 2: Manual Installation

1.  Download this repository.
2.  Copy the `custom_components/family_calendar` folder to your Home Assistant `config/custom_components/` directory.
3.  Restart Home Assistant.

## Configuration

1.  Go to **Settings** > **Devices & Services**.
2.  Click **+ Add Integration** and search for **Family Calendar**.
3.  Follow the setup wizard:
    *   **Select Calendars**: Choose which calendars to display.
    *   **Weather Entity**: (Optional) Select a weather entity for forecasts.
    *   **Customization**: Set colors and friendly names for each calendar.

## Adding to Dashboard

To display the calendar on your Lovelace dashboard, use the **Webpage Card** (iframe).

1.  Edit your Dashboard.
2.  Add a **Webpage** card.
3.  Set the **URL** to:
    ```
    /family_calendar_static/calendar.html
    ```
4.  (Optional) Set the Aspect Ratio to roughly `75%` or adjust height manually to fit the week view.

## Usage

*   **Navigation**: Use the `<` and `>` arrows to switch weeks.
*   **Details**: Click on any event to see details (time, location, description).
*   **Add Event**: Click the **+ Add Event** button in the top right.
*   **Delete Event**: Click an event to open details, then click **Delete**.

## Credits

Built for Home Assistant.
