import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, SimpleChanges } from '@angular/core';
import { FileUploadControl, FileUploadModule, FileUploadValidators } from '@iplab/ngx-file-upload';
import { SharedModule } from '@shared/shared.module';
import { BehaviorSubject, Subscription } from 'rxjs';

interface FileData {
  fileName: string;
  fileType: string;
  extension: string;
  data: string | ArrayBuffer;
  size?: number;
  originalFile?: File;
}

@Component({
  selector: 'vex-pdf-file-selector',
  standalone: true,
  imports: [SharedModule, FileUploadModule],
  templateUrl: './pdf-file-selector.component.html',
  styleUrl: './pdf-file-selector.component.scss'
})
export class PdfFileSelectorComponent implements OnInit, OnDestroy {
  @Input() accept: string[] = ['.pdf'];
  @Input() maxFiles: number = 1;
  @Input() containerClass: string = 'p-4';
  @Input() uploadIcon: string = 'feather icon-upload';
  @Input() deleteIcon: string = 'ti ti-trash';
  @Input() dragDropText: string = 'Arrastre y suelte el archivo PDF aquí';
  @Input() clickText: string = 'Haga clic aquí para elegir un archivo PDF';
  @Input() maxSize: number = 5 * 1024 * 1024; // 10 MB default for PDFs

  @Input() currentUrlPdf: string | null = null;
  hasNewFile: boolean = false;

  @Output() fileSelected = new EventEmitter<FileData>();

  readonly uploadedFile: BehaviorSubject<any> = new BehaviorSubject(null);
  private subscription!: Subscription;

  control!: FileUploadControl;

  constructor() {}

  ngOnInit(): void {
    this.initializeControl();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['accept'] || changes['maxFiles']) {
      this.initializeControl();
    }
  }

  private initializeControl(): void {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }

    this.control = new FileUploadControl(
      {
        listVisible: true,
        accept: this.accept,
        discardInvalid: true,
        multiple: this.maxFiles > 1
      },
      [FileUploadValidators.filesLimit(this.maxFiles)]
    );

    this.subscription = this.control.valueChanges.subscribe((values: Array<File>) => {
      if (values.length > 0) {
        this.processFile(values[0]);
        this.hasNewFile = true;
      } else {
        this.hasNewFile = false;
        // If file removed and we don't have a previous one, emit null or handle accordingly
        if (!this.currentUrlPdf) {
           // Maybe emit null?
        }
      }
    });
  }

  private getFileExtension(filename: string): string {
    return filename.slice(((filename.lastIndexOf(".") - 1) >>> 0) + 2);
  }

  private processFile(file: File): void {
    if (FileReader && file) {
      const fr = new FileReader();
      fr.onload = (e) => {
        const result = e.target!.result;
        this.uploadedFile.next(result);

        const fileData: FileData = {
          fileName: file.name,
          fileType: file.type,
          extension: this.getFileExtension(file.name),
          data: result,
          size: file.size,
          originalFile: file
        };

        this.fileSelected.emit(fileData);
      };
      fr.readAsDataURL(file);
    }
  }

  getReadableFileSize(size: number): string {
    if (size < 1024) {
      return size + ' B';
    } else if (size < 1048576) {
      return (size / 1024).toFixed(2) + ' KB';
    } else if (size < 1073741824) {
      return (size / 1048576).toFixed(2) + ' MB';
    } else {
      return (size / 1073741824).toFixed(2) + ' GB';
    }
  }

  clearExisting(): void {
    this.fileSelected.emit(null);
    this.currentUrlPdf = null;
    this.hasNewFile = false;
    this.control.clear();
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }

  getFileName(url: string): string {
    if (!url) return '';
    return url.split('/').pop() || 'Archivo PDF';
  }
}
