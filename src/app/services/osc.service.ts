import { Injectable, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { webSocket, WebSocketSubject } from 'rxjs/webSocket';
import { AppConfig } from '../core/config/app.config';
import { Subject } from 'rxjs';
import OSC from 'osc-js';

/** Fixed frame rate for SMPTE display (25 fps = 40 ms per frame). */
const SMPTE_FRAMES_PER_SECOND = 25;

@Injectable({
  providedIn: 'root'
})
export class OscService {

  private destroyRef = inject(DestroyRef);

  private host = `${AppConfig.websocketBaseUrl}/realtime`;
  
  public isConnected = signal(false);
  
  public ws: WebSocketSubject<any>;
  
  public messages = new Subject<any>();

  public currentCues = signal<string[]>([]);

  public nextCue = signal<string | null>(null);

  /** Engine armed: Go button enabled when true. */
  public armed = signal(false);

  /** Timecode in milliseconds (from /engine/status/timecode). */
  public timecodeMs = signal<number | null>(null);

  /** Loaded project name (from /engine/status/load). */
  public loadedProject = signal<string>('');

  /** Engine running: playing when true (from /engine/status/running). */
  public running = signal(false);

  constructor() {
    console.log('OscService initialized');

    this.ws = webSocket({
      url: this.host,
      deserializer: (data: any) => this.handleIncomingMessage(data),
      serializer: (msg: any) => msg,
      binaryType: 'arraybuffer',
      openObserver: {
        next: () => this.isConnected.set(true)
      },
      closeObserver: {
        next: () => this.isConnected.set(false)
      }
    });

    // Automatically connect
    this.ws
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (message) => this.messages.next(message),
        error: (error) => {
          console.error('Error:', error);
          this.reconnect();
        }
      });
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.complete();
      this.isConnected.set(false);
      console.log('Desconectado');
    }
  }

  reconnect(): void {
    this.disconnect();
    setTimeout(() => {
      // Recreate the connection
      this.ws = webSocket({
        url: this.host,
        deserializer: (data: any) => this.handleIncomingMessage(data),
        serializer: (msg: any) => msg,
        binaryType: 'arraybuffer',
        openObserver: {
          next: () => this.isConnected.set(true)
        },
        closeObserver: {
          next: () => this.isConnected.set(false)
        }
      });

      this.ws
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (message) => this.messages.next(message),
          error: (error) => {
            console.error('Error:', error);
            this.reconnect();
          }
        });
    }, 1000);
  }

  private handleIncomingMessage(messageEvent: MessageEvent): any {
    console.log('handleIncomingMessage', messageEvent);
    console.log('messageEvent.data', messageEvent.data);
    const dataView = new DataView(messageEvent.data);
    const msg = new OSC.Message('');
    msg.unpack(dataView);
    console.log('msg', msg);
    if (messageEvent.data instanceof ArrayBuffer) {
      return this.handleBinaryMessage(messageEvent.data);
    } else {
      return this.handleJsonMessage(messageEvent.data);
    }
  }
  
  private handleBinaryMessage(data: ArrayBuffer): any {
    const dataView = new DataView(data);
    const msg = new OSC.Message('');
    msg.unpack(dataView);
    this.processOscMessage(msg);
    
    return msg
  }

  private handleJsonMessage(data: any): any {
    return data;
  }

  private processOscMessage(msg: any): void {
    switch (msg.address) {
      case '/engine/status/currentcue':
        const newCurrentCue = msg.args[0];
        // Add to active current cues
        this.currentCues.update(cues => {
          if (!cues.includes(newCurrentCue)) {
            return [...cues, newCurrentCue];
          }
          return cues;
        });
        break;
        
      case '/engine/status/nextcue':
        // Update next cue
        this.nextCue.set(msg.args[0]);
        break;

      case '/engine/status/armed':
        this.armed.set(msg.args[0] === 'yes');
        break;

      case '/engine/status/timecode':
        this.timecodeMs.set(Number(msg.args[0]));
        break;

      case '/engine/status/load':
        this.loadedProject.set(String(msg.args[0] ?? ''));
        break;

      case '/engine/status/running':
        this.running.set(msg.args[0] === 'yes');
        break;
    }
  }

  /**
   * Convert timecode in milliseconds to SMPTE string HH:MM:SS:FF at 25 fps.
   * Negative ms is treated as 0; max display 99:59:59:24.
   */
  public timecodeToSMPTE(ms: number): string {
    if (ms < 0) ms = 0;
    const totalSeconds = ms / 1000;
    const maxSeconds = 99 * 3600 + 59 * 60 + 59 + 24 / SMPTE_FRAMES_PER_SECOND;
    const clamped = Math.min(totalSeconds, maxSeconds);
    const hours = Math.floor(clamped / 3600);
    const minutes = Math.floor((clamped % 3600) / 60);
    const seconds = Math.floor(clamped % 60);
    const frames = Math.floor((clamped % 1) * SMPTE_FRAMES_PER_SECOND);
    return [
      String(hours).padStart(2, '0'),
      String(minutes).padStart(2, '0'),
      String(seconds).padStart(2, '0'),
      String(frames).padStart(2, '0')
    ].join(':');
  }

  public go(): void {
    const messageGo = new OSC.Message('/engine/command/go');
    const binaryGo = messageGo.pack();
    console.log('command Go!!!');
    this.ws.next(binaryGo);
  }

  public stop(): void {
    const messageStop = new OSC.Message('/engine/command/stop');
    const binaryStop = messageStop.pack();
    this.ws.next(binaryStop);
  }

  public pause(): void {
    const messagePause = new OSC.Message('/engine/command/pause');
    const binaryPause = messagePause.pack();
    this.ws.next(binaryPause);
  }

  /**
   * Audio Mixer
   * Send a message to update the master volume for a node
   * @param nodeUuid The UUID of the node to update the master volume for
   * @param volume The volume to set for the node
   */
  public sendMasterVolumeUpdate(nodeUuid: string, volume: number): void {
    const messageMasterVolumeUpdate = new OSC.Message(`${nodeUuid}/audio/mixer/0/master/volume`, volume);
    console.log('volume', volume);
    const binaryMasterVolumeUpdate = messageMasterVolumeUpdate.pack();
    this.ws.next(binaryMasterVolumeUpdate);
  }

  /**
   * Audio Mixer
   * Send a message to update the volume for a node
   * @param nodeUuid The UUID of the node to update the volume for
   * @param channelIndex The index of the channel-output to update the volume for
   * @param volume The volume to set for the node
   */
  public sendNodeVolumeUpdate(nodeUuid: string, channelIndex: number, volume: number): void {
    const messageNodeVolumeUpdate = new OSC.Message(`${nodeUuid}/audio/mixer/0/${channelIndex}/volume`, volume);
    const binaryNodeVolumeUpdate = messageNodeVolumeUpdate.pack();
    console.log('volume', volume);
    this.ws.next(binaryNodeVolumeUpdate);
  }

  /**
   * Video Mixer
   * @param nodeUuid The UUID of the node to update the scale for
   * @param outputIndex The index of the output to update the scale for
   * @param xScale The x scale to set for the output
   * @param yScale The y scale to set for the output
   */
  public sendVideoMixerScaleUpdate(nodeUuid: string, outputIndex: number, xScale: number, yScale: number): void {
    const messageVideoMixerXScaleUpdate = new OSC.Message(`${nodeUuid}/video/mixer/${outputIndex}/xscale`, xScale);
    const binaryVideoMixerXScaleUpdate = messageVideoMixerXScaleUpdate.pack();
    this.ws.next(binaryVideoMixerXScaleUpdate);

    const messageVideoMixerYScaleUpdate = new OSC.Message(`${nodeUuid}/video/mixer/${outputIndex}/yscale`, yScale);
    const binaryVideoMixerYScaleUpdate = messageVideoMixerYScaleUpdate.pack();
    this.ws.next(binaryVideoMixerYScaleUpdate);
  }

  /**
   * Video Mixer
   * @param nodeUuid The UUID of the node to update the corner for
   * @param outputIndex The index of the output to update the corner for
   * @param cornerPosition The position of the corner to update the corner for
   * @param x The x position to set for the corner
   * @param y The y position to set for the corner
   */
  public sendVideoMixerCornerUpdate(nodeUuid: string, outputIndex: number, cornerPosition: number, x: number, y: number): void {
    const messageVideoMixerCornerUpdate = new OSC.Message(`${nodeUuid}/video/mixer/${outputIndex}/${cornerPosition}/corner${cornerPosition}`, x, y);
    const binaryVideoMixerCornerUpdate = messageVideoMixerCornerUpdate.pack();
    this.ws.next(binaryVideoMixerCornerUpdate);
  }
}