export class Options {
  hideWindowOnStart: boolean = true;
  focusDuration: number = 25; // minutes
  shortBreakDuration: number = 5; // minutes
  longBreakDuration: number = 15; // minutes
  autostart: boolean = false;
  fullscreen: boolean = false;
  soundEnabled: boolean = true;

  constructor(data?: Partial<Options>) {
    if (data) {
      this.hideWindowOnStart = data.hideWindowOnStart ?? this.hideWindowOnStart;
      this.focusDuration = data.focusDuration ?? this.focusDuration;
      this.shortBreakDuration = data.shortBreakDuration ?? this.shortBreakDuration;
      this.longBreakDuration = data.longBreakDuration ?? this.longBreakDuration;
      this.autostart = data.autostart ?? this.autostart;
      this.fullscreen = data.fullscreen ?? this.fullscreen;
      this.soundEnabled = data.soundEnabled ?? this.soundEnabled;
    }
  }

  static fromJSON(json: string): Options {
    try {
      const data = JSON.parse(json);
      return new Options(data);
    } catch {
      return new Options();
    }
  }

  static load(): Options {
    const savedSettings = localStorage.getItem('lemSettings');
    if (savedSettings) {
      return Options.fromJSON(savedSettings);
    }
    return new Options();
  }

  toJSON(): string {
    return JSON.stringify({
      hideWindowOnStart: this.hideWindowOnStart,
      focusDuration: this.focusDuration,
      shortBreakDuration: this.shortBreakDuration,
      longBreakDuration: this.longBreakDuration,
      autostart: this.autostart,
      fullscreen: this.fullscreen,
      soundEnabled: this.soundEnabled
    });
  }

  save(): void {
    localStorage.setItem('lemSettings', this.toJSON());
  }
}
