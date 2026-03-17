import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';
import type { PoolControllerPlatform } from '../platform.js';
import type { NjspcChlorinator } from '../njspcApi.js';

export class ChlorinatorAccessory {
  private readonly service: Service;
  private isOn = false;
  private poolSetpoint = 0;
  private spaSetpoint = 0;
  private currentOutput = 0;

  constructor(
    private readonly platform: PoolControllerPlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    const chlor: NjspcChlorinator = accessory.context.device;
    this.poolSetpoint = chlor.poolSetpoint ?? 0;
    this.spaSetpoint = chlor.spaSetpoint ?? 0;
    this.currentOutput = chlor.currentOutput ?? 0;
    this.isOn = this.currentOutput > 0;

    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'njsPC')
      .setCharacteristic(this.platform.Characteristic.Model, 'Chlorinator')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, `chlor-${chlor.id}`);

    // Use Fan service to represent chlorinator output percentage
    this.service = this.accessory.getService(this.platform.Service.Fan)
      || this.accessory.addService(this.platform.Service.Fan, chlor.name);

    this.service.setCharacteristic(this.platform.Characteristic.Name, chlor.name);

    this.service.getCharacteristic(this.platform.Characteristic.On)
      .onSet(this.setOn.bind(this))
      .onGet(this.getOn.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.RotationSpeed)
      .setProps({ minValue: 0, maxValue: 100, minStep: 1 })
      .onSet(this.setSpeed.bind(this))
      .onGet(this.getSpeed.bind(this));
  }

  updateState(data: NjspcChlorinator): void {
    this.poolSetpoint = data.poolSetpoint ?? 0;
    this.spaSetpoint = data.spaSetpoint ?? 0;
    this.currentOutput = data.currentOutput ?? 0;
    this.isOn = this.currentOutput > 0;

    this.service.updateCharacteristic(this.platform.Characteristic.On, this.isOn);
    this.service.updateCharacteristic(this.platform.Characteristic.RotationSpeed, this.currentOutput);
    this.accessory.context.device = data;
  }

  private async setOn(value: CharacteristicValue): Promise<void> {
    const chlor: NjspcChlorinator = this.accessory.context.device;
    const newSetpoint = value ? (this.poolSetpoint || 50) : 0;
    this.platform.log.debug('Set chlorinator', chlor.name, 'on ->', value);
    try {
      await this.platform.njspcApi.setChlorinatorOutput(chlor.id, newSetpoint, this.spaSetpoint);
      this.isOn = value as boolean;
      this.poolSetpoint = newSetpoint;
    } catch (err) {
      this.platform.log.error('Failed to set chlorinator state:', (err as Error).message);
      throw new this.platform.api.hap.HapStatusError(
        this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE,
      );
    }
  }

  private async getOn(): Promise<CharacteristicValue> {
    return this.isOn;
  }

  private async setSpeed(value: CharacteristicValue): Promise<void> {
    const chlor: NjspcChlorinator = this.accessory.context.device;
    const setpoint = value as number;
    this.platform.log.debug('Set chlorinator', chlor.name, 'output ->', setpoint, '%');
    try {
      await this.platform.njspcApi.setChlorinatorOutput(chlor.id, setpoint, this.spaSetpoint);
      this.poolSetpoint = setpoint;
      this.isOn = setpoint > 0;
    } catch (err) {
      this.platform.log.error('Failed to set chlorinator output:', (err as Error).message);
      throw new this.platform.api.hap.HapStatusError(
        this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE,
      );
    }
  }

  private async getSpeed(): Promise<CharacteristicValue> {
    return this.currentOutput;
  }
}
