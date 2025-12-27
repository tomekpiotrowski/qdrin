import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';
import { Options } from '../models/options';

const WindowWidth = 400;
const WindowHeight = 200;

enum State {
  Stopped, // Not started or paused
  Focus,  // In a focus session
  FocusPaused, // Focus session paused
  FocusExtra, // User postponed the break by clicking "Snooze"
  FocusExtraPaused, // FocusExtra session paused
  Break, // In a break session
  WaitingForFocus // Break is over, waiting for user to click "Back to Work"
}

@Component({
  selector: 'app-timer',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './timer.component.html',
  styleUrl: './timer.component.css'
})
export class TimerComponent implements OnInit, OnDestroy {
  // Timer state
  timeRemaining = 5; // 5 seconds for testing
  completedSessions = 0;
  state: State = State.Stopped;
  fullscreen = false;

  // Settings
  settings = new Options();

  // Timer configuration (will be updated from settings)
  private WORK_TIME = 5; // 5 seconds for testing
  private BREAK_TIME = 5; // 5 seconds for testing
  private LONG_BREAK_TIME = 15 * 60;
  private readonly FOCUS_EXTRA_TIME = 60; // 1 minute

  private timerInterval: any = null;
  private timerEndTime: number = 0; // Timestamp when timer should complete

  // Audio context for sounds
  private audioContext: AudioContext | null = null;

  // Expose State enum to template
  readonly State = State;

  // Helper getters for template
  get isRunning(): boolean {
    return this.timerInterval !== null;
  }

  get isWorkSession(): boolean {
    return this.state === State.Focus || this.state === State.FocusPaused ||
      this.state === State.FocusExtra || this.state === State.FocusExtraPaused ||
      this.state === State.Stopped || this.state === State.WaitingForFocus;
  }

  get isBreakMode(): boolean {
    return this.state === State.Break;
  }

  get isBreakSnoozed(): boolean {
    return this.state === State.FocusExtra;
  }

  get isWaitingForFocus(): boolean {
    return this.state === State.WaitingForFocus;
  }

  get sessionLabel(): string {
    switch (this.state) {
      case State.Stopped:
        return 'Ready to Start';
      case State.Focus:
        return 'Focus';
      case State.FocusPaused:
        return 'Focus (Paused)';
      case State.FocusExtra:
        return 'Focus';
      case State.FocusExtraPaused:
        return 'Focus (Paused)';
      case State.Break:
        return 'Break Time';
      case State.WaitingForFocus:
        return 'Ready to Focus';
      default:
        return '';
    }
  }

  constructor() {
    // Request notification permission on startup
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    // Initialize audio context
    if (typeof AudioContext !== 'undefined') {
      this.audioContext = new AudioContext();
    }

    // Load settings from localStorage
    this.loadSettings();

    // Listen for storage changes (when options are saved)
    window.addEventListener('storage', () => {
      this.loadSettings();
    });
  }

  ngOnInit(): void {
    // Apply fullscreen setting on startup
    if (this.settings.fullscreen) {
      this.applyFullscreenOnStartup();
    }
  }

  private loadSettings(): void {
    this.settings = Options.load();
    // Update timer durations from settings
    this.WORK_TIME = this.settings.focusDuration * 60;
    this.BREAK_TIME = this.settings.shortBreakDuration * 60;
    this.LONG_BREAK_TIME = this.settings.longBreakDuration * 60;
    this.fullscreen = this.settings.fullscreen;

    // Update current time if in stopped state
    if (this.state === State.Stopped) {
      this.timeRemaining = this.WORK_TIME;
    }
  }

  private updateFocusState(newState: State): void {
    this.state = newState;
    // Determine if we're in a focusing state
    const isFocusing = newState === State.Focus || newState === State.FocusExtra;
    // Notify backend
    invoke('set_focus_state', { isFocusing }).catch(err => {
      console.error('Failed to update focus state:', err);
    });
  }

  get formattedTime(): string {
    const minutes = Math.floor(this.timeRemaining / 60);
    const seconds = this.timeRemaining % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  async startTimer(): Promise<void> {
    if (this.isRunning) return;

    // Set initial state if stopped or waiting
    if (this.state === State.Stopped || this.state === State.WaitingForFocus) {
      this.updateFocusState(State.Focus);
    } else if (this.state === State.FocusPaused) {
      this.updateFocusState(State.Focus);
    } else if (this.state === State.FocusExtraPaused) {
      this.updateFocusState(State.FocusExtra);
    }

    // Only hide window during focus sessions
    if (this.state === State.Focus || this.state === State.FocusExtra) {
      if (this.settings.soundEnabled) {
        this.playFocusSound();
      }
      if (this.settings.hideWindowOnStart) {
        try {
          const window = getCurrentWindow();
          await window.hide();
        } catch (error) {
          console.error('Failed to hide window:', error);
        }
      }
    }

    this.timerInterval = setInterval(() => {
      const now = Date.now();
      const remaining = Math.max(0, Math.ceil((this.timerEndTime - now) / 1000));

      if (remaining !== this.timeRemaining) {
        this.timeRemaining = remaining;
      }

      if (this.timeRemaining <= 0) {
        this.completeSession();
      }
    }, 100); // Check every 100ms for more accurate display

    // Store end time based on current timeRemaining
    this.timerEndTime = Date.now() + (this.timeRemaining * 1000);
  }

  pauseTimer(): void {
    if (this.timerInterval) {
      // Update timeRemaining based on actual time left before clearing interval
      const now = Date.now();
      this.timeRemaining = Math.max(0, Math.ceil((this.timerEndTime - now) / 1000));

      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }

    // Update state to paused variant
    if (this.state === State.Focus) {
      this.updateFocusState(State.FocusPaused);
    } else if (this.state === State.FocusExtra) {
      this.updateFocusState(State.FocusExtraPaused);
    }
  }

  async resetTimer(): Promise<void> {
    this.pauseTimer();
    this.timeRemaining = this.WORK_TIME;
    this.updateFocusState(State.Stopped);

    // Drop break UI affordances (e.g., always-on-top) when returning to stopped
    await this.exitBreakMode();
  }

  private async completeSession(): Promise<void> {
    // Save the state before pausing (since pauseTimer changes state)
    const stateBeforePause = this.state;
    this.pauseTimer();

    const wasFocusState = stateBeforePause === State.Focus || stateBeforePause === State.FocusExtra;

    // Show notification
    if ('Notification' in window && Notification.permission === 'granted') {
      const title = wasFocusState ? 'Work Session Complete!' : 'Break Complete!';
      const body = wasFocusState ? 'Time for a break!' : 'Time to focus!';
      const notification = new Notification(title, {
        body: body,
        icon: '/assets/icon.png',
        requireInteraction: true
      });

      // Focus window when notification is clicked
      notification.onclick = () => {
        this.focusWindow();
        notification.close();
      };
    }

    // Try to bring window to focus
    await this.focusWindow();

    if (stateBeforePause === State.FocusExtra) {
      // FocusExtra session completed, go back to break
      this.updateFocusState(State.Break);
      if (this.settings.soundEnabled) {
        this.playBreakSound();
      }
      await this.enterBreakMode();

      // Resume remaining break time
      this.timeRemaining = this.remainingBreakTime;
      this.startTimer();
    } else if (stateBeforePause === State.Focus) {
      // Focus session completed, start break
      this.completedSessions++;
      this.updateFocusState(State.Break);
      if (this.settings.soundEnabled) {
        this.playBreakSound();
      }
      await this.enterBreakMode();

      // Use long break every 4 sessions
      this.timeRemaining = this.completedSessions % 4 === 0
        ? this.LONG_BREAK_TIME
        : this.BREAK_TIME;

      this.startTimer();
    } else {
      // Break completed, wait for user to start focus
      this.updateFocusState(State.WaitingForFocus);
      this.timeRemaining = this.WORK_TIME;
      await this.exitBreakMode();
      // Don't auto-start, wait for user
      return;
    }
  }

  private async focusWindow(): Promise<void> {
    try {
      const window = getCurrentWindow();
      await window.unminimize();
      await window.setFocus();
      await window.setAlwaysOnTop(true);
      // Disable always on top after a moment
      setTimeout(async () => {
        await window.setAlwaysOnTop(false);
      }, 100);
    } catch (error) {
      console.error('Failed to focus window:', error);
    }
  }

  public async enterBreakMode(): Promise<void> {
    try {
      const window = getCurrentWindow();
      await window.show();
      await window.setAlwaysOnTop(true);
    } catch (error) {
      console.error('Failed to enter break mode:', error);
    }
  }

  private async exitBreakMode(): Promise<void> {
    try {
      const window = getCurrentWindow();
      await window.setAlwaysOnTop(false);
    } catch (error) {
      console.error('Failed to exit break mode:', error);
    }
  }

  private playFocusSound(): void {
    if (!this.audioContext) return;

    try {
      const oscillator = this.audioContext.createOscillator();
      const gainNode = this.audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(this.audioContext.destination);

      // Ascending tone (focus starting)
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(400, this.audioContext.currentTime);
      oscillator.frequency.linearRampToValueAtTime(600, this.audioContext.currentTime + 0.1);

      gainNode.gain.setValueAtTime(0.3, this.audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.2);

      oscillator.start(this.audioContext.currentTime);
      oscillator.stop(this.audioContext.currentTime + 0.2);
    } catch (error) {
      console.error('Failed to play focus sound:', error);
    }
  }

  private playBreakSound(): void {
    if (!this.audioContext) return;

    try {
      const oscillator1 = this.audioContext.createOscillator();
      const oscillator2 = this.audioContext.createOscillator();
      const gainNode = this.audioContext.createGain();

      oscillator1.connect(gainNode);
      oscillator2.connect(gainNode);
      gainNode.connect(this.audioContext.destination);

      // Two-tone chime (break starting)
      oscillator1.type = 'sine';
      oscillator1.frequency.setValueAtTime(600, this.audioContext.currentTime);

      oscillator2.type = 'sine';
      oscillator2.frequency.setValueAtTime(800, this.audioContext.currentTime + 0.15);

      gainNode.gain.setValueAtTime(0.3, this.audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.5);

      oscillator1.start(this.audioContext.currentTime);
      oscillator1.stop(this.audioContext.currentTime + 0.15);

      oscillator2.start(this.audioContext.currentTime + 0.15);
      oscillator2.stop(this.audioContext.currentTime + 0.5);
    } catch (error) {
      console.error('Failed to play break sound:', error);
    }
  }

  private remainingBreakTime = 0;

  async snoozeBreak(): Promise<void> {
    if (this.state !== State.Break) return;

    // Store remaining break time
    this.remainingBreakTime = this.timeRemaining;

    this.updateFocusState(State.FocusExtra);
    await this.exitBreakMode();

    // Start 1 minute timer
    this.timeRemaining = this.FOCUS_EXTRA_TIME;
    this.startTimer();
  }

  openStats(): void {
    // TODO: Implement stats view
    console.log('Open stats');
  }

  private async applyFullscreenOnStartup(): Promise<void> {
    try {
      await this.setFullscreenMode(true);
    } catch (error) {
      console.error('Failed to apply fullscreen on startup:', error);
    }
  }

  async toggleFullscreen(): Promise<void> {
    this.fullscreen = !this.fullscreen;
    // Save fullscreen setting
    this.settings.fullscreen = this.fullscreen;
    this.settings.save();

    try {
      await this.setFullscreenMode(this.fullscreen);
    } catch (error) {
      console.error('Failed to toggle fullscreen:', error);
    }
  }

  private async setFullscreenMode(enable: boolean): Promise<void> {
    const window = getCurrentWindow();

    if (enable) {
      await window.setResizable(true);
      await new Promise(resolve => setTimeout(resolve, 50));
      await window.setFullscreen(true);
    } else {
      await window.setFullscreen(false);
      await new Promise(resolve => setTimeout(resolve, 50));
      await window.setSize(new LogicalSize(WindowWidth, WindowHeight));
      await window.setResizable(false);
    }
  }

  async openOptions(): Promise<void> {
    const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
    const optionsWindow = new WebviewWindow('options', {
      url: '/options',
      title: 'Qdrin - Options',
      width: 400,
      height: 400,
      resizable: true,
      center: true
    });
  }

  async hideWindow(): Promise<void> {
    try {
      const window = getCurrentWindow();
      await window.hide();
    } catch (error) {
      console.error('Failed to hide window:', error);
    }
  }

  ngOnDestroy(): void {
    this.pauseTimer();
  }
}
