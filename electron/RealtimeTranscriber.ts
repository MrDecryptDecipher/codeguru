import { ChildProcessWithoutNullStreams, spawn } from 'child_process'
import { EventEmitter } from 'events'
import ffmpegPath from 'ffmpeg-static'
import os from 'os'
import { Deepgram, LiveClient } from '@deepgram/sdk'
import { ConfigManager } from './ConfigManager'

const record = require('node-record-lpcm16')

export interface RealtimeTranscriptEvent {
  text: string
  confidence: number
  isFinal: boolean
  timestamp: number
}

interface TranscriberOptions {
  sampleRate: number
  language: string
  interimResults: boolean
  systemDevice: string
  microphoneDevice: string
  includeSystemAudio: boolean
}

export class RealtimeTranscriber extends EventEmitter {
  private dg: Deepgram | null = null
  private liveClient: LiveClient | null = null
  private captureProcess: ChildProcessWithoutNullStreams | null = null
  private isRunning = false
  private config: TranscriberOptions

  constructor(private configManager: ConfigManager) {
    super()
    const realtimeConfig = this.configManager.getSection('realtime')
    this.config = {
      sampleRate: realtimeConfig.transcription.sampleRate,
      language: realtimeConfig.transcription.language,
      interimResults: realtimeConfig.transcription.interimResults,
      systemDevice: realtimeConfig.transcription.systemDevice,
      microphoneDevice: realtimeConfig.transcription.microphoneDevice,
      includeSystemAudio: realtimeConfig.transcription.includeSystemAudio
    }
  }

  public async start(): Promise<void> {
    if (this.isRunning) return

    const apiKey = process.env.DEEPGRAM_API_KEY
    if (!apiKey) {
      throw new Error(
        'DEEPGRAM_API_KEY not found. Set it in your environment to enable real-time transcription.'
      )
    }

    this.dg = new Deepgram(apiKey)

    this.liveClient = await this.dg.transcription.live({
      model: 'nova-2',
      interim_results: this.config.interimResults,
      language: this.config.language,
      encoding: 'linear16',
      sample_rate: this.config.sampleRate,
      smart_format: true,
      vad_events: true
    })

    this.liveClient.addListener('transcriptReceived', (dgEvent: any) => {
      const data = typeof dgEvent === 'string' ? JSON.parse(dgEvent) : dgEvent
      const alternatives = data?.channel?.alternatives
      if (!alternatives || alternatives.length === 0) return

      const transcript = alternatives[0]
      if (!transcript.transcript) return

      const event: RealtimeTranscriptEvent = {
        text: transcript.transcript.trim(),
        confidence: transcript.confidence || 0,
        isFinal: data.is_final ?? false,
        timestamp: Date.now()
      }
      this.emit('transcript', event)
    })

    this.liveClient.addListener('warning', (warning) => {
      console.warn('[RealtimeTranscriber] warning', warning)
    })

    this.liveClient.addListener('error', (error) => {
      console.error('[RealtimeTranscriber] deepgram error', error)
      this.emit('error', error)
      this.stop()
    })

    await this.startCapture()
    this.isRunning = true
    this.emit('started')
  }

  public stop(): void {
    if (!this.isRunning) return
    this.isRunning = false

    if (this.captureProcess) {
      this.captureProcess.stdout.removeAllListeners()
      this.captureProcess.stderr.removeAllListeners()
      this.captureProcess.kill('SIGTERM')
      this.captureProcess = null
    } else {
      record.stop()
    }

    if (this.liveClient) {
      this.liveClient.finish()
      this.liveClient.removeAllListeners()
      this.liveClient = null
    }

    this.emit('stopped')
  }

  public get isActive(): boolean {
    return this.isRunning
  }

  private async startCapture(): Promise<void> {
    if (!this.liveClient) {
      throw new Error('Deepgram connection missing')
    }

    const isWindows = os.platform() === 'win32'
    const ffmpegBinary = ffmpegPath ? ffmpegPath.toString() : null

    if (isWindows && ffmpegBinary) {
      const deviceArgs = this.buildWindowsDeviceArgs()
      const args = [
        '-f',
        'dshow',
        ...deviceArgs,
        '-ac',
        '1',
        '-ar',
        String(this.config.sampleRate),
        '-f',
        's16le',
        'pipe:1'
      ]

      this.captureProcess = spawn(ffmpegBinary, args, {
        stdio: ['ignore', 'pipe', 'pipe']
      })

      this.captureProcess.stdout.on('data', (chunk: Buffer) => {
        this.liveClient?.send(chunk)
      })

      this.captureProcess.stderr.on('data', (chunk) => {
        const msg = chunk.toString()
        if (msg.includes('Error')) {
          console.error('[RealtimeTranscriber] FFmpeg error:', msg)
        }
      })

      this.captureProcess.on('close', (code) => {
        if (code !== 0) {
          console.warn('[RealtimeTranscriber] FFmpeg exited with code', code)
        }
      })
    } else {
      record
        .record({
          sampleRate: this.config.sampleRate,
          threshold: 0,
          verbose: false,
          recordProgram: os.platform() === 'win32' ? 'sox' : 'rec'
        })
        .stream()
        .on('error', (error: Error) => {
          console.error('[RealtimeTranscriber] node-record error:', error)
          this.emit('error', error)
        })
        .on('data', (chunk: Buffer) => {
          this.liveClient?.send(chunk)
        })
    }
  }

  private buildWindowsDeviceArgs(): string[] {
    const devices: string[] = []
    if (this.config.includeSystemAudio) {
      devices.push(`audio=${this.config.systemDevice}`)
    }
    if (this.config.microphoneDevice && this.config.microphoneDevice !== 'default') {
      devices.push(`audio=${this.config.microphoneDevice}`)
    }

    if (devices.length === 0) {
      return ['-i', 'audio=default']
    }

    if (devices.length === 1) {
      return ['-i', devices[0]]
    }

    // When multiple devices are provided we rely on dshow's ability to handle colon separated devices.
    return ['-i', devices.join(':')]
  }
}

