import { Routes } from "@angular/router";
import { TimerComponent } from "./timer/timer.component";
import { OptionsComponent } from "./options/options.component";

export const routes: Routes = [
  { path: '', component: TimerComponent },
  { path: 'options', component: OptionsComponent }
];
