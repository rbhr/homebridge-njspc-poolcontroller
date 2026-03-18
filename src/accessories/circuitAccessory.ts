import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';
import type { PoolControllerPlatform } from '../platform.js';
import type { NjspcCircuit } from '../njspcApi.js';

const LIGHT_TYPES = ['intellibrite', 'light', 'sam', 'sal', 'color', 'dimmer', 'globrite', 'magicstream'];

function isLightCircuit(circuit: NjspcCircuit): boolean {
  const typeName = circuit.type?.name?.toLowerCase() ?? '';
  return LIGHT_TYPES.some(t => typeName.includes(t));
}

export class CircuitAccessory {
  private readonly service: Service;
  private isOn = false;

  constructor(
    private readonly platform: PoolControllerPlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    const circuit: NjspcCircuit = accessory.context.device;
    this.isOn = circuit.isOn ?? false;

    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'njsPC')
      .setCharacteristic(this.platform.Characteristic.Model, circuit.type?.desc ?? 'Circuit')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, `circuit-${circuit.id}`);

    const ServiceType = isLightCircuit(circuit)
      ? this.platform.Service.Lightbulb
      : this.platform.Service.Switch;

    this.service = this.accessory.getService(ServiceType)
      || this.accessory.addService(ServiceType, circuit.name);

    this.service.setCharacteristic(this.platform.Characteristic.Name, circuit.name);

    this.service.getCharacteristic(this.platform.Characteristic.On)
      .onSet(this.setOn.bind(this))
      .onGet(this.getOn.bind(this));
  }

  updateState(data: NjspcCircuit): void {
    this.isOn = data.isOn ?? this.isOn;
    this.service.updateCharacteristic(this.platform.Characteristic.On, this.isOn);
    this.accessory.context.device = data;
  }

  private async setOn(value: CharacteristicValue): Promise<void> {
    const circuit: NjspcCircuit = this.accessory.context.device;
    this.platform.log.debug('Set circuit', circuit.name, '->', value);
    try {
      await this.platform.njspcApi.setCircuitState(circuit.id, value as boolean);
      this.isOn = value as boolean;
    } catch (err) {
      this.platform.log.error('Failed to set circuit state:', (err as Error).message);
      throw new this.platform.api.hap.HapStatusError(
        this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE,
      );
    }
  }

  private async getOn(): Promise<CharacteristicValue> {
    return this.isOn;
  }
}
