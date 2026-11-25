import { Component, EventEmitter, Input, OnInit, Output, forwardRef, OnDestroy, SimpleChanges, ChangeDetectorRef } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { NgSelectModule } from '@ng-select/ng-select';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Subject, Subscription, of } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap, catchError, map } from 'rxjs/operators';

@Component({
  selector: 'app-select-search-pagination',
  templateUrl: './select-search-pagination.component.html',
  styleUrls: ['./select-search-pagination.component.scss'],
  imports: [CommonModule, NgSelectModule, FormsModule, ReactiveFormsModule],
/*   providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => SelectSearchPaginationComponent),
      multi: true
    }
  ] */
})
export class SelectSearchPaginationComponent implements OnInit, OnDestroy, ControlValueAccessor {

  // Inputs configuration
  @Input() label: string = '';
  @Input() placeholder: string = 'Seleccione una opción';
  @Input() service: any; // Service instance
  @Input() method: string = 'GetAll'; // Method name in service
  
  // NgSelect configuration
  @Input() bindLabel: string = 'name';
  @Input() bindValue: string = 'id';
  @Input() multiple: boolean = false;
  
  // Custom Filters
  @Input() getInputs: string = ''; 
  
  // State
  items: any[] = [];
  loading: boolean = false;
  page: number = 0;
  size: number = 10;
  totalRecords: number = 0;
  searchTerm: string = '';

  // Typeahead for search
  typeaheadInput$ = new Subject<string>();
  private searchSubscription?: Subscription;

  // ControlValueAccessor
  value: any;
  onChange = (_: any) => {};
  onTouched = () => {};
  disabled = false;

  constructor(private cd: ChangeDetectorRef) { }

  ngOnInit(): void {
    this.loadData();
    this.setupSearch();
  }

  ngOnDestroy(): void {
    this.searchSubscription?.unsubscribe();
  }

  ngOnChanges(changes: SimpleChanges): void {
     if (changes['getInputs'] && !changes['getInputs'].firstChange) {
       this.items = [];
       this.page = 0;
       this.loadData();
     }
  }

  setupSearch() {
    this.searchSubscription = this.typeaheadInput$.pipe(
      debounceTime(400),
      distinctUntilChanged()
    ).subscribe(term => {
      this.searchTerm = term;
      this.page = 0;
      this.items = [];
      this.loadData();
    });
  }

  loadData() {
    if (!this.service || !this.service[this.method]) {
      console.warn('SelectSearchPagination: Service or Method not defined');
      return;
    }

    this.loading = true;
    
    // Construct filter string
    // Assumes backend standard: &textFilter=term
    let filterParams = this.getInputs || '';
    if (this.searchTerm) {
      filterParams += `&textFilter=${encodeURIComponent(this.searchTerm)}`;
    }

    // Call Service: method(size, page, filters)
    this.service[this.method](this.size, this.page, filterParams).subscribe({
      next: (resp: any) => {
        if (resp.succeeded) {
          const newItems = resp.data || [];
          this.items = [...this.items, ...newItems];
          this.totalRecords = resp.totalRecords || 0;
          this.cd.detectChanges(); // Force check to prevent NG0100
        }
        this.loading = false;
        this.cd.markForCheck(); // Ensure UI updates loading state
      },
      error: () => {
        this.loading = false;
        this.cd.markForCheck();
      }
    });
  }

  onScrollToEnd() {
    if (this.items.length < this.totalRecords && !this.loading) {
      this.page++;
      this.loadData();
    }
  }

  onSearch(event: { term: string, items: any[] }) {
    if (event.term) {
       this.typeaheadInput$.next(event.term);
    }
  }

  // ControlValueAccessor methods
  writeValue(value: any): void {
    this.value = value;
  }
  
  registerOnChange(fn: any): void {
    this.onChange = fn;
  }
  
  registerOnTouched(fn: any): void {
    this.onTouched = fn;
  }
  
  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  onSelectionChange(event: any) {
    this.value = event;
    this.onChange(event);
  }
}
