import type { Logging } from 'homebridge';
import { io, Socket } from 'socket.io-client';
import { EventEmitter } from 'events';

export interface NjspcCircuit {
  id: number;
  name: string;
  isOn: boolean;
  type: { val: number; name: string; desc: string };
  lightingTheme?: { val: number; name: string; desc: string };
}

export interface NjspcBody {
  id: number;
  name: string;
  temp: number;
  isOn: boolean;
  setPoint: number;
  heatMode: { val: number; name: string; desc: string };
  heatStatus: { val: number; name: string; desc: string };
  heaterOptions?: { total: number };
}

export interface NjspcPump {
  id: number;
  name: string;
  isOn: boolean;
  watts: number;
  rpm: number;
  gpm: number;
  type: { val: number; name: string; desc: string };
}

export interface NjspcChlorinator {
  id: number;
  name: string;
  currentOutput: number;
  poolSetpoint: number;
  spaSetpoint: number;
  superChlor: boolean;
  status: { val: number; name: string; desc: string };
}

export interface NjspcTemps {
  air: number;
  waterSensor1: number;
  waterSensor2: number;
  bodies: NjspcBody[];
}

export interface NjspcState {
  circuits: NjspcCircuit[];
  features: NjspcCircuit[];
  bodies: NjspcBody[];
  pumps: NjspcPump[];
  chlorinators: NjspcChlorinator[];
  temps: NjspcTemps;
}

export class NjspcApi extends EventEmitter {
  private socket: Socket | null = null;
  private readonly host: string;

  constructor(
    private readonly log: Logging,
    host: string,
  ) {
    super();
    this.host = host.replace(/\/+$/, '');
  }

  async getState(): Promise<NjspcState> {
    const url = `${this.host}/state/all`;
    this.log.debug('Fetching state from:', url);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`njsPC returned ${response.status}: ${response.statusText}`);
    }
    return await response.json() as NjspcState;
  }

  connect(): void {
    if (this.socket) {
      return;
    }

    this.log.info('Connecting to njsPC at', this.host);
    this.socket = io(this.host, {
      reconnection: true,
      reconnectionDelay: 2000,
      reconnectionAttempts: Infinity,
      transports: ['websocket', 'polling'],
    });

    this.socket.on('connect', () => {
      this.log.info('Connected to njsPC');
      this.emit('connected');
    });

    this.socket.on('disconnect', (reason) => {
      this.log.warn('Disconnected from njsPC:', reason);
    });

    this.socket.on('connect_error', (err) => {
      this.log.error('njsPC connection error:', err.message);
    });

    const events = ['circuit', 'feature', 'body', 'temps', 'pump', 'chlorinator', 'controller'] as const;
    for (const event of events) {
      this.socket.on(event, (data: unknown) => {
        this.log.debug(`njsPC event [${event}]:`, JSON.stringify(data));
        this.emit(event, data);
      });
    }
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  async setCircuitState(id: number, isOn: boolean): Promise<void> {
    const url = `${this.host}/state/circuit/setState`;
    this.log.debug('Setting circuit', id, 'to', isOn);
    const response = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, state: isOn }),
    });
    if (!response.ok) {
      throw new Error(`Failed to set circuit state: ${response.status}`);
    }
  }

  async setBodyHeatMode(id: number, mode: number): Promise<void> {
    const url = `${this.host}/state/body/heatMode`;
    this.log.debug('Setting body', id, 'heat mode to', mode);
    const response = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, mode }),
    });
    if (!response.ok) {
      throw new Error(`Failed to set heat mode: ${response.status}`);
    }
  }

  async setBodySetPoint(id: number, setPoint: number): Promise<void> {
    const url = `${this.host}/state/body/setPoint`;
    this.log.debug('Setting body', id, 'setpoint to', setPoint);
    const response = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, setPoint }),
    });
    if (!response.ok) {
      throw new Error(`Failed to set body setpoint: ${response.status}`);
    }
  }

  async setChlorinatorOutput(id: number, poolSetpoint: number, spaSetpoint: number): Promise<void> {
    const url = `${this.host}/state/chlorinator/setChlor`;
    this.log.debug('Setting chlorinator', id, 'pool:', poolSetpoint, 'spa:', spaSetpoint);
    const response = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, poolSetpoint, spaSetpoint }),
    });
    if (!response.ok) {
      throw new Error(`Failed to set chlorinator output: ${response.status}`);
    }
  }
}
