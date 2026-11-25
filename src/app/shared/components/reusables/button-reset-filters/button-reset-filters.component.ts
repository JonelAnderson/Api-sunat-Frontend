import { Component, EventEmitter, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SharedModule } from '../../../shared.module';


@Component({
  selector: 'app-button-reset-filters',
  standalone: true,
  imports: [SharedModule],
  templateUrl: './button-reset-filters.component.html',
  styleUrls: ['./button-reset-filters.component.scss']
})
export class ButtonResetFiltersComponent  {
@Output() buttonClick = new  EventEmitter<void>();

emitClick(){
  return this.buttonClick.emit();
}
 

}


