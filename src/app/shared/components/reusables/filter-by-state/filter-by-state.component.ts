import { Component, EventEmitter, Input, OnInit, Output } from "@angular/core";
import { CommonModule } from "@angular/common";
import { MenuItems } from "../../../models/menu-items.interface";
import { FormsModule } from "@angular/forms";
import { MatIconModule } from "@angular/material/icon";
import { MatTooltipModule } from "@angular/material/tooltip";
import { NgbDropdownModule } from '@ng-bootstrap/ng-bootstrap';

@Component({
  selector: 'app-filter-by-state',
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    MatTooltipModule,
    FormsModule,
    NgbDropdownModule
  ],
  templateUrl: './filter-by-state.component.html',
  styleUrls: ['./filter-by-state.component.scss'],
})
export class FilterByStateComponent implements OnInit {

  @Input() currentMenu: number;
  @Input() items: MenuItems[];

  @Output() filterChange = new EventEmitter<any>();

  activeItem: MenuItems["id"] = "all";

  ngOnInit(): void {
    this.setCurrentFilter(this.currentMenu);
  }

  setCurrentFilter(itemNumber: number) {
    let currentItem = this.items.find((item) => item.value == itemNumber);
    this.activeItem = currentItem ? currentItem.id : "all";
  }

  setFilter(selectedItemId: any, items: MenuItems[]) {
    const selectedItem = items.find(item => item.id === selectedItemId);
    this.activeItem = selectedItem.id;
    this.filterChange.emit(selectedItem.value);
  }

  optionClick(selectedItem: MenuItems) {
    this.setFilter(selectedItem.id, this.items);
  }

  isActive(item: MenuItems["id"]) {
    return this.activeItem === item;
  }
 
  resetFilter() {
    const allItem = this.items.find(item => item.id === "all");
    if (allItem) {
      this.activeItem = "all";
      this.filterChange.emit(undefined); // or emit the value associated with "all"
    }
  }

  getActiveLabel(): string {
    const item = this.items?.find(i => i.id === this.activeItem);
    return item ? item.label : '';
  }

  getActiveIcon(): string {
    const item = this.items?.find(i => i.id === this.activeItem);
    return item ? item.icon : '';
  }
}
