import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { enable, disable, isEnabled } from '@tauri-apps/plugin-autostart';
import { Options } from '../models/options';
import { StatusService } from '../status.service';
@Component({
  selector: 'app-options',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './options.component.html',
  styleUrl: './options.component.css'
})
export class OptionsComponent implements OnInit {
  settings = new Options();
  constructor(public statusService: StatusService) {}

  ngOnInit(): void {
    this.settings = Options.load();
    this.syncAutostart();
  }

  private async syncAutostart(): Promise<void> {
    try {
      this.settings.autostart = await isEnabled();
    } catch (err) {
      console.error('Failed to read autostart state', err);
    }
  }

  async toggleAutostart(enabled: boolean): Promise<void> {
    try {
      if (enabled) {
        await enable();
      } else {
        await disable();
      }
    } catch (err) {
      console.error('Failed to update autostart', err);
    } finally {
      try {
        this.settings.autostart = await isEnabled();
      } catch (err) {
        console.error('Failed to confirm autostart state', err);
        // fall back to the requested value when confirmation fails
        this.settings.autostart = enabled;
      }
      this.saveSettings();
    }
  }

  saveSettings(): void {
    this.settings.save();
    // Trigger storage event for the timer component
    window.dispatchEvent(new Event('storage'));
  }

  onKeyDown(event: KeyboardEvent): void {
    // Allow: backspace, delete, tab, escape, enter, arrows
    const allowedKeys = ['Backspace', 'Delete', 'Tab', 'Escape', 'Enter', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];

    if (allowedKeys.includes(event.key)) {
      return;
    }

    // Allow: Ctrl+A, Ctrl+C, Ctrl+V, Ctrl+X
    if ((event.ctrlKey || event.metaKey) && ['a', 'c', 'v', 'x'].includes(event.key.toLowerCase())) {
      return;
    }

    // Prevent if not a number
    if (!/^[0-9]$/.test(event.key)) {
      event.preventDefault();
    }
  }

  validateInput(event: Event, field: keyof Pick<Options, 'focusDuration' | 'shortBreakDuration' | 'longBreakDuration'>, defaultValue: number = 1): void {
    const input = event.target as HTMLInputElement;
    const value = parseInt(input.value, 10);

    // If not a valid number, zero, or negative, reset to default
    if (isNaN(value) || value < 1) {
      this.settings[field] = defaultValue;
    }

    this.saveSettings();
  }

  increment(field: keyof Pick<Options, 'focusDuration' | 'shortBreakDuration' | 'longBreakDuration'>, max: number): void {
    if (this.settings[field] < max) {
      this.settings[field]++;
      this.saveSettings();
    }
  }

  decrement(field: keyof Pick<Options, 'focusDuration' | 'shortBreakDuration' | 'longBreakDuration'>, min: number): void {
    if (this.settings[field] > min) {
      this.settings[field]--;
      this.saveSettings();
    }
  }

}