import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, ViewEncapsulation } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatTooltipModule } from '@angular/material/tooltip';
import { NgSelectModule } from '@ng-select/ng-select';

@Component({
  selector: 'app-filter-select',
  imports: [CommonModule, FormsModule, NgSelectModule, MatTooltipModule],
  templateUrl: './filter-select.component.html',
  styleUrls: ['./filter-select.component.scss'],
  encapsulation: ViewEncapsulation.None,
})
export class FilterSelectComponent implements OnChanges {
  @Input() items: any[] = [];
  @Input() bindLabel = 'name';
  @Input() bindValue = 'id';
  @Input() placeholder = 'Filtrar';
  @Input() clearable = true;
  @Input() currentValue: any = null;
  @Input() tooltip = '';
  @Input() minWidth = '180px';

  @Output() filterChange = new EventEmitter<any>();

  selectedValue: any = null;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['currentValue']) {
      this.selectedValue = this.currentValue;
    }
  }

  onValueChange(value: any): void {
    if (this.selectedValue === value) return;
    this.selectedValue = value;
    this.filterChange.emit(value ?? null);
  }

  resetFilter(): void {
    this.selectedValue = null;
    this.filterChange.emit(null);
  }
}
