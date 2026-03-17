import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';
import type { PoolControllerPlatform } from '../platform.js';

export class TemperatureSensorAccessory {
  private readonly service: Service;
  private currentTemp = 0;

  constructor(
    private readonly platform: PoolControllerPlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    const sensor = accessory.context.device as { id: string; name: string; temp: number };
    this.currentTemp = this.toC(sensor.temp);

    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'njsPC')
      .setCharacteristic(this.platform.Characteristic.Model, 'Temperature Sensor')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, `temp-${sensor.id}`);

    this.service = this.accessory.getService(this.platform.Service.TemperatureSensor)
      || this.accessory.addService(this.platform.Service.TemperatureSensor, sensor.name);

    this.service.setCharacteristic(this.platform.Characteristic.Name, sensor.name);

    this.service.getCharacteristic(this.platform.Characteristic.CurrentTemperature)
      .onGet(this.getTemp.bind(this));
  }

  updateTemp(tempF: number): void {
    this.currentTemp = this.toC(tempF);
    this.service.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, this.currentTemp);
  }

  private toC(f: number): number {
    if (f === 0 || f === undefined) {
      return 0;
    }
    return Math.round(((f - 32) * 5 / 9) * 10) / 10;
  }

  private async getTemp(): Promise<CharacteristicValue> {
    return this.currentTemp;
  }
}
