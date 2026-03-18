import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';
import type { PoolControllerPlatform } from '../platform.js';
import type { NjspcPump } from '../njspcApi.js';

export class PumpAccessory {
  private readonly service: Service;
  private isOn = false;
  private rpm = 0;
  private watts = 0;

  constructor(
    private readonly platform: PoolControllerPlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    const pump: NjspcPump = accessory.context.device;
    this.isOn = pump.isOn ?? false;
    this.rpm = pump.rpm ?? 0;
    this.watts = pump.watts ?? 0;

    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'njsPC')
      .setCharacteristic(this.platform.Characteristic.Model, pump.type?.desc ?? 'Pump')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, `pump-${pump.id}`);

    // Expose pump as a Fan so we can show rotation speed
    this.service = this.accessory.getService(this.platform.Service.Fan)
      || this.accessory.addService(this.platform.Service.Fan, pump.name);

    this.service.setCharacteristic(this.platform.Characteristic.Name, pump.name);

    this.service.getCharacteristic(this.platform.Characteristic.On)
      .onGet(this.getOn.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.RotationSpeed)
      .setProps({ minValue: 0, maxValue: 100, minStep: 1 })
      .onGet(this.getSpeed.bind(this));
  }

  updateState(data: NjspcPump): void {
    this.isOn = data.isOn ?? this.isOn;
    this.rpm = data.rpm ?? 0;
    this.watts = data.watts ?? 0;

    this.service.updateCharacteristic(this.platform.Characteristic.On, this.isOn);
    this.service.updateCharacteristic(this.platform.Characteristic.RotationSpeed, this.rpmToPercent());
    this.accessory.context.device = data;
  }

  // Map RPM (0-3450) to percentage (0-100)
  private rpmToPercent(): number {
    const maxRpm = 3450;
    return Math.min(100, Math.round((this.rpm / maxRpm) * 100));
  }

  private async getOn(): Promise<CharacteristicValue> {
    return this.isOn;
  }

  private async getSpeed(): Promise<CharacteristicValue> {
    return this.rpmToPercent();
  }
}
