// angular import
import { Component } from '@angular/core';

// project import
import { SharedModule } from '@shared/shared.module';

/** Lado izquierdo de la barra superior. El panel no es multiempresa: no hay selector de empresa / sucursal. */
@Component({
  selector: 'app-nav-left',
  imports: [SharedModule],
  templateUrl: './nav-left.component.html',
  styleUrls: ['./nav-left.component.scss']
})
export class NavLeftComponent {}
