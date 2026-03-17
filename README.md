<p align="center">
<img src="https://github.com/homebridge/branding/raw/latest/logos/homebridge-wordmark-logo-vertical.png" width="150">
</p>

# Homebridge njsPC Pool Controller

A [Homebridge](https://homebridge.io) plugin that integrates [nodejs-poolController](https://github.com/tagyoureit/nodejs-poolController) (njsPC) with Apple HomeKit. Control your pool and spa equipment — circuits, lights, heaters, chlorinator, and more — directly from the Home app and via Siri.

## Features

- **Circuits & Lights** — Toggle pool circuits as switches; light circuits (IntelliBrite, GloBrite, MagicStream, etc.) appear as HomeKit lightbulbs
- **Thermostat Control** — Pool and spa bodies are exposed as thermostats with setpoint adjustment and heat mode control
- **Temperature Sensors** — Air and water temperature sensors displayed in HomeKit
- **Pump Monitoring** — View pump status, RPM, and power consumption (read-only)
- **Chlorinator Control** — Adjust chlorine output percentage and toggle super chlorination
- **Real-time Updates** — Socket.IO connection to njsPC provides instant state synchronization
- **Auto-Discovery** — All equipment is discovered automatically from your njsPC instance
- **Selective Visibility** — Hide specific circuits, features, sensors, pumps, or the chlorinator from HomeKit

## Requirements

- [Homebridge](https://homebridge.io) v1.8+ or v2.0+
- Node.js 20, 22, or 24
- A running [nodejs-poolController](https://github.com/tagyoureit/nodejs-poolController) instance

## Installation

### Via Homebridge UI (Recommended)

Search for `homebridge-njspc-poolcontroller` in the Homebridge UI plugin tab and click **Install**.

### Via Command Line

```shell
npm install -g homebridge-njspc-poolcontroller
```

## Configuration

Add the platform to your Homebridge `config.json` under `platforms`:

```json
{
  "platforms": [
    {
      "platform": "NjspcPoolController",
      "name": "Pool Controller",
      "host": "http://192.168.1.100:4200"
    }
  ]
}
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `name` | string | `"Pool Controller"` | Display name for the platform |
| `host` | string | `"http://localhost:4200"` | URL of your njsPC instance |
| `skipCircuitIds` | number[] | `[]` | Circuit IDs to exclude from HomeKit |
| `skipFeatureIds` | number[] | `[]` | Feature IDs to exclude from HomeKit |
| `hideAirSensor` | boolean | `false` | Hide the air temperature sensor |
| `hideWaterSensors` | boolean | `false` | Hide water temperature sensors |
| `hidePumps` | boolean | `false` | Hide pump accessories |
| `hideChlorinator` | boolean | `false` | Hide the chlorinator accessory |

You can also configure everything through the Homebridge UI settings panel — no manual JSON editing required.

### Finding Circuit IDs

To find circuit and feature IDs for the `skipCircuitIds` / `skipFeatureIds` options, open your njsPC dashboard or query `http://<njspc-host>:4200/state/all` and look at the `circuits` and `features` arrays.

## HomeKit Accessory Mapping

| Pool Equipment | HomeKit Service | Controls |
|----------------|----------------|----------|
| Circuits | Switch | On / Off |
| Light Circuits | Lightbulb | On / Off |
| Pool / Spa Body | Thermostat | Temperature setpoint, heat mode |
| Air Temp | Temperature Sensor | Current temperature (read-only) |
| Water Temp | Temperature Sensor | Current temperature (read-only) |
| Pumps | Fan | Status and RPM as speed (read-only) |
| Chlorinator | Fan | Output percentage, on/off |

## Development

```shell
# Install dependencies
npm install

# Build
npm run build

# Lint
npm run lint

# Link for local Homebridge testing
npm link

# Watch mode (auto-rebuild + restart Homebridge)
npm run watch
```

## License

Apache 2.0 — see [LICENSE](./LICENSE).
