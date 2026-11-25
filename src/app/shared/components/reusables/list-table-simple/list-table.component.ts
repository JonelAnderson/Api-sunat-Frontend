import { CommonModule } from "@angular/common";
import {
  AfterViewInit,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnInit,
  Output,
  SimpleChanges,
} from "@angular/core";
import { FormsModule } from "@angular/forms";
import { MatIconModule } from "@angular/material/icon";
import { MatPaginatorIntl } from "@angular/material/paginator";
import { MatTableDataSource, MatTableModule } from "@angular/material/table";
import { MatTooltipModule } from "@angular/material/tooltip";
import { TableColumns, TableFooter } from "../../../models/list-table.interface";
import { getEsPaginatorIntl } from "../../../paginator-intl/es-paginator-intl";
import { SharedModule } from "../../../shared.module";
import { NgxSpinnerModule, NgxSpinnerService } from "ngx-spinner";
import { TableAction } from "@shared/models/table-action.interface";
import { AlertModalService } from "@shared/service/alert-modal.service";
import { DefaultService } from "@shared/service/default.service";


@Component({
  selector: "app-list-table-simple",
  imports: [
    CommonModule,
    MatTableModule,
    MatTooltipModule,
    MatIconModule,
    FormsModule,
    SharedModule,
    NgxSpinnerModule
  ],
  templateUrl: "./list-table.component.html",
  styleUrls: ["./list-table.component.scss"],
  providers: [
    {
      provide: MatPaginatorIntl,
      useValue: getEsPaginatorIntl(),
    },
    
  ],
})
export class ListTableSimpleComponent<T> implements OnInit, AfterViewInit, OnChanges {
  @Input() service?: any;
  @Input() columns?: TableColumns<T>[];
  @Input() footer: TableFooter<T>[] = [];
  @Input() actions: TableAction[] = [];

  
  @Output() actionTriggered = new EventEmitter<{ action: string; row: T }>();

  @Input() stateChange?: EventEmitter<void>;
  @Input() registerSuccess?: EventEmitter<void>;
  @Input() updateSuccess?: EventEmitter<void>;
  @Input() deleteSuccess?: EventEmitter<void>;


  dataSource = new MatTableDataSource<T>();

  visibleColumns?: Array<keyof T | string>;
  visibleFooter?: Array<keyof T | string | object>;

 
  constructor(
    private _spinner: NgxSpinnerService,
    private alertModalService:AlertModalService
  ) {}

  ngOnInit(): void {
    if (this.stateChange) {
      this.stateChange.subscribe(() => this.getDataByService());
    }

    if (this.registerSuccess) {
      this.registerSuccess.subscribe(() => this.getDataByService());
    }

    if (this.updateSuccess) {
      this.updateSuccess.subscribe(() => this.getDataByService());
    }
    
    if (this.deleteSuccess) {
      this.deleteSuccess.subscribe(() => this.getDataByService());
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['columns']) {
      this.setVisibleColumns();
    }
    
  }

  setVisibleColumns() {
    this.visibleColumns = this.columns
      .filter((columns: any) => columns.visible)
      .map((columns: any) => columns.property);
  }

  ngAfterViewInit(): void {
    if (this.service && this.isDefaultService(this.service)) {
      
      this.getDataByService();
    } else {
      console.log('El servicio proporcionado no implementa DefaultService.');
    }

  }


  async getDataByService() {
    this._spinner.show("show-table");
    try {
      const data = await this.service.GetAllList().toPromise();
      await this.setData(data);
    } catch (error) {
      await this.alertModalService.showNotification(
        'Atención',
        'Ha ocurrido un error al cargar los datos',
        'warning'
      );
    } finally {
      this._spinner.hide("show-table");
    }
  }


  async setData(data: any) {
    const rows = Array.isArray(data?.data) ? data.data : [];
    const isEmptyList = rows.length === 0 && (data?.totalRecords ?? 0) === 0;
    if (data.succeeded || isEmptyList) {
      this.setVisibleColumns();
      this.dataSource.data = rows;
      if (data.footer) this.setFooter(data.footer);
      
      this.dataSource._updateChangeSubscription();
    } 
    else{
      await this.alertModalService.showNotification(
        'Atención',
        'Ha ocurrido un error al cargar los datos',
        'warning'
      );
    }
  }
  

  setFooter(data: any) {
    this.visibleFooter = [];
    if (this.footer.length && data) {
      this.footer.forEach((e) => {
        this.visibleFooter.push({
          label: e.label,
          value: data[e.property],
          tooltip: e.tooltip,
        });
      });
    }
  }




 
  private isDefaultService(obj: any): obj is DefaultService {
    return 'GetAllList' in obj ;
  }


  handleAction(actionId: string, row: T): void {
    this.actionTriggered.emit({ action: actionId, row });
  }

  isActionVisible(action: TableAction, row: any): boolean {
    if (action.visible) {
      return action.visible(row);
    }
    if (action.showOnState) {
      return row[action.showOnState.field] === action.showOnState.value;
    }
    return true;
  }

  isActionDisabled(action: TableAction, row: any): boolean {
    return action.disabled ? action.disabled(row) : false;
  }

  getActionLabel(action: TableAction, row: any): string {
    return typeof action.label === 'function' ? action.label(row) : action.label;
  }

  getActionIcon(action: TableAction, row: any): string {
    return typeof action.icon === 'function' ? action.icon(row) : action.icon;
  }

  getActionColor(action: TableAction, row: any): string {
    if (!action.color) return 'primary';
    return typeof action.color === 'function' ? action.color(row) : action.color;
  }

  getActionTooltip(action: TableAction, row: any): string {
    if (!action.tooltip) return action.label as string;
    return typeof action.tooltip === 'function' ? action.tooltip(row) : action.tooltip;
  }
 

  getData() {
    return this.dataSource.data;

  }

  formatDate(dateString: string): string {
    const options: Intl.DateTimeFormatOptions = { 
      day: 'numeric', 
      month: 'long', 
      year: 'numeric', 
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hour12: true
    };
    const date = new Date(dateString);
    return date.toLocaleDateString('es-ES', options);
  }



}
