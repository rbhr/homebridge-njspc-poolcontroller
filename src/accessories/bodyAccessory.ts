import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';
import type { PoolControllerPlatform } from '../platform.js';
import type { NjspcBody } from '../njspcApi.js';

// njsPC heat mode values
const HEAT_MODE_OFF = 0;
const HEAT_MODE_HEATER = 1;

export class BodyAccessory {
  private readonly service: Service;
  private currentTemp = 0;
  private targetTemp = 0;
  private heatModeVal = HEAT_MODE_OFF;
  private heatStatusVal = 0;

  constructor(
    private readonly platform: PoolControllerPlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    const body: NjspcBody = accessory.context.device;
    this.currentTemp = this.toC(body.temp);
    this.targetTemp = this.toC(body.setPoint);
    this.heatModeVal = body.heatMode?.val ?? HEAT_MODE_OFF;
    this.heatStatusVal = body.heatStatus?.val ?? 0;

    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'njsPC')
      .setCharacteristic(this.platform.Characteristic.Model, 'Pool/Spa Body')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, `body-${body.id}`);

    this.service = this.accessory.getService(this.platform.Service.Thermostat)
      || this.accessory.addService(this.platform.Service.Thermostat, body.name);

    this.service.setCharacteristic(this.platform.Characteristic.Name, body.name);
    this.service.setCharacteristic(
      this.platform.Characteristic.TemperatureDisplayUnits,
      this.platform.Characteristic.TemperatureDisplayUnits.FAHRENHEIT,
    );

    // Set valid temperature range (4.4°C to 40°C / 40°F to 104°F)
    this.service.getCharacteristic(this.platform.Characteristic.TargetTemperature)
      .setProps({ minValue: 4.4, maxValue: 40, minStep: 0.5 });

    this.service.getCharacteristic(this.platform.Characteristic.TargetHeatingCoolingState)
      .setProps({
        validValues: [
          this.platform.Characteristic.TargetHeatingCoolingState.OFF,
          this.platform.Characteristic.TargetHeatingCoolingState.HEAT,
        ],
      })
      .onSet(this.setHeatingState.bind(this))
      .onGet(this.getHeatingState.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.TargetTemperature)
      .onSet(this.setTargetTemp.bind(this))
      .onGet(this.getTargetTemp.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.CurrentTemperature)
      .onGet(this.getCurrentTemp.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.CurrentHeatingCoolingState)
      .onGet(this.getCurrentHeatingState.bind(this));
  }

  updateState(data: NjspcBody): void {
    this.currentTemp = this.toC(data.temp);
    this.targetTemp = this.toC(data.setPoint);
    this.heatModeVal = data.heatMode?.val ?? HEAT_MODE_OFF;
    this.heatStatusVal = data.heatStatus?.val ?? 0;

    this.service.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, this.currentTemp);
    this.service.updateCharacteristic(this.platform.Characteristic.TargetTemperature, this.targetTemp);
    this.service.updateCharacteristic(
      this.platform.Characteristic.TargetHeatingCoolingState,
      this.heatModeToHk(this.heatModeVal),
    );
    this.service.updateCharacteristic(
      this.platform.Characteristic.CurrentHeatingCoolingState,
      this.heatStatusVal > 0
        ? this.platform.Characteristic.CurrentHeatingCoolingState.HEAT
        : this.platform.Characteristic.CurrentHeatingCoolingState.OFF,
    );
    this.accessory.context.device = data;
  }

  updateTemp(temp: number): void {
    this.currentTemp = this.toC(temp);
    this.service.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, this.currentTemp);
  }

  // Convert Fahrenheit to Celsius
  private toC(f: number): number {
    if (f === 0 || f === undefined) {
      return 0;
    }
    return Math.round(((f - 32) * 5 / 9) * 10) / 10;
  }

  // Convert Celsius to Fahrenheit
  private toF(c: number): number {
    return Math.round(c * 9 / 5 + 32);
  }

  private heatModeToHk(mode: number): number {
    if (mode === HEAT_MODE_OFF) {
      return this.platform.Characteristic.TargetHeatingCoolingState.OFF;
    }
    return this.platform.Characteristic.TargetHeatingCoolingState.HEAT;
  }

  private async setHeatingState(value: CharacteristicValue): Promise<void> {
    const body: NjspcBody = this.accessory.context.device;
    const mode = value === this.platform.Characteristic.TargetHeatingCoolingState.OFF
      ? HEAT_MODE_OFF
      : HEAT_MODE_HEATER;
    this.platform.log.debug('Set heat mode for', body.name, '->', mode);
    try {
      await this.platform.njspcApi.setBodyHeatMode(body.id, mode);
      this.heatModeVal = mode;
    } catch (err) {
      this.platform.log.error('Failed to set heat mode:', (err as Error).message);
      throw new this.platform.api.hap.HapStatusError(
        this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE,
      );
    }
  }

  private async getHeatingState(): Promise<CharacteristicValue> {
    return this.heatModeToHk(this.heatModeVal);
  }

  private async setTargetTemp(value: CharacteristicValue): Promise<void> {
    const body: NjspcBody = this.accessory.context.device;
    const tempF = this.toF(value as number);
    this.platform.log.debug('Set target temp for', body.name, '->', tempF, '°F');
    try {
      await this.platform.njspcApi.setBodySetPoint(body.id, tempF);
      this.targetTemp = value as number;
    } catch (err) {
      this.platform.log.error('Failed to set target temperature:', (err as Error).message);
      throw new this.platform.api.hap.HapStatusError(
        this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE,
      );
    }
  }

  private async getTargetTemp(): Promise<CharacteristicValue> {
    return this.targetTemp;
  }

  private async getCurrentTemp(): Promise<CharacteristicValue> {
    return this.currentTemp;
  }

  private async getCurrentHeatingState(): Promise<CharacteristicValue> {
    return this.heatStatusVal > 0
      ? this.platform.Characteristic.CurrentHeatingCoolingState.HEAT
      : this.platform.Characteristic.CurrentHeatingCoolingState.OFF;
  }
}
