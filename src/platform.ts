import type { API, Characteristic, DynamicPlatformPlugin, Logging, PlatformAccessory, PlatformConfig, Service } from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js';
import { NjspcApi } from './njspcApi.js';
import type { NjspcBody, NjspcChlorinator, NjspcCircuit, NjspcPump, NjspcTemps } from './njspcApi.js';
import { CircuitAccessory } from './accessories/circuitAccessory.js';
import { BodyAccessory } from './accessories/bodyAccessory.js';
import { PumpAccessory } from './accessories/pumpAccessory.js';
import { TemperatureSensorAccessory } from './accessories/temperatureSensorAccessory.js';
import { ChlorinatorAccessory } from './accessories/chlorinatorAccessory.js';

interface PluginConfig extends PlatformConfig {
  host?: string;
  skipCircuitIds?: number[];
  skipFeatureIds?: number[];
  hideAirSensor?: boolean;
  hideWaterSensors?: boolean;
  hidePumps?: boolean;
  hideChlorinator?: boolean;
}

export class PoolControllerPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;
  public readonly njspcApi: NjspcApi;

  private readonly cachedAccessories: Map<string, PlatformAccessory> = new Map();
  private readonly discoveredUUIDs: Set<string> = new Set();
  private readonly pluginConfig: PluginConfig;

  // Accessory handler maps for socket updates
  private readonly circuitHandlers: Map<number, CircuitAccessory> = new Map();
  private readonly bodyHandlers: Map<number, BodyAccessory> = new Map();
  private readonly pumpHandlers: Map<number, PumpAccessory> = new Map();
  private readonly chlorinatorHandlers: Map<number, ChlorinatorAccessory> = new Map();
  private airSensorHandler: TemperatureSensorAccessory | null = null;
  private readonly waterSensorHandlers: Map<string, TemperatureSensorAccessory> = new Map();

  constructor(
    public readonly log: Logging,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.Service = api.hap.Service;
    this.Characteristic = api.hap.Characteristic;
    this.pluginConfig = config as PluginConfig;

    const host = this.pluginConfig.host ?? 'http://localhost:4200';
    this.njspcApi = new NjspcApi(log, host);

    this.log.debug('Initialized njsPC Pool Controller plugin');

    this.api.on('didFinishLaunching', () => {
      this.discoverDevices();
    });
  }

  configureAccessory(accessory: PlatformAccessory): void {
    this.log.info('Restoring cached accessory:', accessory.displayName);
    this.cachedAccessories.set(accessory.UUID, accessory);
  }

  private async discoverDevices(): Promise<void> {
    try {
      this.log.info('Fetching state from njsPC...');
      const state = await this.njspcApi.getState();
      this.registerDevices(state);
      this.setupSocketListeners();
      this.njspcApi.connect();
    } catch (err) {
      this.log.error('Failed to connect to njsPC:', (err as Error).message);
      this.log.error('Will retry on socket reconnection.');
      this.setupSocketListeners();
      this.njspcApi.connect();
      this.njspcApi.on('connected', async () => {
        try {
          const state = await this.njspcApi.getState();
          this.registerDevices(state);
        } catch (retryErr) {
          this.log.error('Retry failed:', (retryErr as Error).message);
        }
      });
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private registerDevices(state: any): void {
    const skipCircuits = new Set(this.pluginConfig.skipCircuitIds ?? []);
    const skipFeatures = new Set(this.pluginConfig.skipFeatureIds ?? []);

    // Register circuits
    for (const circuit of (state.circuits ?? [])) {
      if (skipCircuits.has(circuit.id)) {
        continue;
      }
      this.registerCircuit(circuit, 'circuit');
    }

    // Register features (same as circuits but different namespace)
    for (const feature of (state.features ?? [])) {
      if (skipFeatures.has(feature.id)) {
        continue;
      }
      this.registerCircuit(feature, 'feature');
    }

    // Register bodies (thermostats)
    for (const body of (state.temps?.bodies ?? state.bodies ?? [])) {
      this.registerBody(body);
    }

    // Register temperature sensors
    if (!this.pluginConfig.hideAirSensor && state.temps?.air !== undefined) {
      this.registerTempSensor('air', 'Air Temperature', state.temps.air);
    }

    if (!this.pluginConfig.hideWaterSensors) {
      if (state.temps?.waterSensor1 !== undefined && state.temps.waterSensor1 > 0) {
        this.registerTempSensor('water1', 'Water Sensor 1', state.temps.waterSensor1);
      }
      if (state.temps?.waterSensor2 !== undefined && state.temps.waterSensor2 > 0) {
        this.registerTempSensor('water2', 'Water Sensor 2', state.temps.waterSensor2);
      }
    }

    // Register pumps
    if (!this.pluginConfig.hidePumps) {
      for (const pump of (state.pumps ?? [])) {
        if (pump.type?.val > 0) {
          this.registerPump(pump);
        }
      }
    }

    // Register chlorinators
    if (!this.pluginConfig.hideChlorinator) {
      for (const chlor of (state.chlorinators ?? [])) {
        this.registerChlorinator(chlor);
      }
    }

    // Remove stale cached accessories
    for (const [uuid, accessory] of this.cachedAccessories) {
      if (!this.discoveredUUIDs.has(uuid)) {
        this.log.info('Removing stale accessory:', accessory.displayName);
        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }
    }

    this.log.info(`Discovered ${this.discoveredUUIDs.size} accessories`);
  }

  private registerCircuit(circuit: NjspcCircuit, prefix: string): void {
    const uuid = this.api.hap.uuid.generate(`${prefix}-${circuit.id}`);
    this.discoveredUUIDs.add(uuid);

    const existingAccessory = this.cachedAccessories.get(uuid);
    if (existingAccessory) {
      this.log.info('Restoring circuit:', circuit.name);
      existingAccessory.context.device = circuit;
      const handler = new CircuitAccessory(this, existingAccessory);
      this.circuitHandlers.set(circuit.id, handler);
    } else {
      this.log.info('Adding circuit:', circuit.name);
      const accessory = new this.api.platformAccessory(circuit.name, uuid);
      accessory.context.device = circuit;
      const handler = new CircuitAccessory(this, accessory);
      this.circuitHandlers.set(circuit.id, handler);
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    }
  }

  private registerBody(body: NjspcBody): void {
    const uuid = this.api.hap.uuid.generate(`body-${body.id}`);
    this.discoveredUUIDs.add(uuid);

    const existingAccessory = this.cachedAccessories.get(uuid);
    if (existingAccessory) {
      this.log.info('Restoring body:', body.name);
      existingAccessory.context.device = body;
      const handler = new BodyAccessory(this, existingAccessory);
      this.bodyHandlers.set(body.id, handler);
    } else {
      this.log.info('Adding body:', body.name);
      const accessory = new this.api.platformAccessory(body.name, uuid);
      accessory.context.device = body;
      const handler = new BodyAccessory(this, accessory);
      this.bodyHandlers.set(body.id, handler);
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    }
  }

  private registerTempSensor(id: string, name: string, temp: number): void {
    const uuid = this.api.hap.uuid.generate(`temp-${id}`);
    this.discoveredUUIDs.add(uuid);

    const existingAccessory = this.cachedAccessories.get(uuid);
    if (existingAccessory) {
      this.log.info('Restoring sensor:', name);
      existingAccessory.context.device = { id, name, temp };
      const handler = new TemperatureSensorAccessory(this, existingAccessory);
      if (id === 'air') {
        this.airSensorHandler = handler;
      } else {
        this.waterSensorHandlers.set(id, handler);
      }
    } else {
      this.log.info('Adding sensor:', name);
      const accessory = new this.api.platformAccessory(name, uuid);
      accessory.context.device = { id, name, temp };
      const handler = new TemperatureSensorAccessory(this, accessory);
      if (id === 'air') {
        this.airSensorHandler = handler;
      } else {
        this.waterSensorHandlers.set(id, handler);
      }
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    }
  }

  private registerPump(pump: NjspcPump): void {
    const uuid = this.api.hap.uuid.generate(`pump-${pump.id}`);
    this.discoveredUUIDs.add(uuid);

    const existingAccessory = this.cachedAccessories.get(uuid);
    if (existingAccessory) {
      this.log.info('Restoring pump:', pump.name);
      existingAccessory.context.device = pump;
      const handler = new PumpAccessory(this, existingAccessory);
      this.pumpHandlers.set(pump.id, handler);
    } else {
      this.log.info('Adding pump:', pump.name);
      const accessory = new this.api.platformAccessory(pump.name, uuid);
      accessory.context.device = pump;
      const handler = new PumpAccessory(this, accessory);
      this.pumpHandlers.set(pump.id, handler);
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    }
  }

  private registerChlorinator(chlor: NjspcChlorinator): void {
    const uuid = this.api.hap.uuid.generate(`chlorinator-${chlor.id}`);
    this.discoveredUUIDs.add(uuid);

    const existingAccessory = this.cachedAccessories.get(uuid);
    if (existingAccessory) {
      this.log.info('Restoring chlorinator:', chlor.name);
      existingAccessory.context.device = chlor;
      const handler = new ChlorinatorAccessory(this, existingAccessory);
      this.chlorinatorHandlers.set(chlor.id, handler);
    } else {
      this.log.info('Adding chlorinator:', chlor.name);
      const accessory = new this.api.platformAccessory(chlor.name, uuid);
      accessory.context.device = chlor;
      const handler = new ChlorinatorAccessory(this, accessory);
      this.chlorinatorHandlers.set(chlor.id, handler);
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    }
  }

  private setupSocketListeners(): void {
    this.njspcApi.on('circuit', (data: NjspcCircuit) => {
      const handler = this.circuitHandlers.get(data.id);
      if (handler) {
        handler.updateState(data);
      }
    });

    this.njspcApi.on('feature', (data: NjspcCircuit) => {
      const handler = this.circuitHandlers.get(data.id);
      if (handler) {
        handler.updateState(data);
      }
    });

    this.njspcApi.on('body', (data: NjspcBody) => {
      const handler = this.bodyHandlers.get(data.id);
      if (handler) {
        handler.updateState(data);
      }
    });

    this.njspcApi.on('temps', (data: NjspcTemps) => {
      if (this.airSensorHandler && data.air !== undefined) {
        this.airSensorHandler.updateTemp(data.air);
      }
      if (data.waterSensor1 !== undefined) {
        this.waterSensorHandlers.get('water1')?.updateTemp(data.waterSensor1);
      }
      if (data.waterSensor2 !== undefined) {
        this.waterSensorHandlers.get('water2')?.updateTemp(data.waterSensor2);
      }
      // Update body temperatures from temps event
      if (data.bodies) {
        for (const body of data.bodies) {
          const handler = this.bodyHandlers.get(body.id);
          if (handler) {
            handler.updateState(body);
          }
        }
      }
    });

    this.njspcApi.on('pump', (data: NjspcPump) => {
      const handler = this.pumpHandlers.get(data.id);
      if (handler) {
        handler.updateState(data);
      }
    });

    this.njspcApi.on('chlorinator', (data: NjspcChlorinator) => {
      const handler = this.chlorinatorHandlers.get(data.id);
      if (handler) {
        handler.updateState(data);
      }
    });
  }
}
