import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, SimpleChanges } from '@angular/core';
import { FileUploadControl, FileUploadModule, FileUploadValidators } from '@iplab/ngx-file-upload';
import { ShortenFilenamePipe } from '@shared/pipes/shorten-filename.pipe';
import { AlertModalService } from '@shared/service/alert-modal.service';
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
  selector: 'vex-file-selector',
  standalone: true,
  imports: [SharedModule, FileUploadModule,ShortenFilenamePipe],
  templateUrl: './file-selector.component.html',
  styleUrl: './file-selector.component.scss'
})
export class FileSelectorComponent  implements OnInit, OnDestroy {
  @Input() accept: string[] = ['.jpg', '.jpeg', '.png']; 
  @Input() maxFiles: number = 1;
  @Input() containerClass: string = 'p-4';
  @Input() uploadIcon: string = 'feather icon-upload';
  @Input() deleteIcon: string = 'ti ti-trash';
  @Input() dragDropText: string = 'Drag and drop or click here';
  @Input() clickText: string = 'Click here to choose a file';
  @Input() isImage: boolean = false;
  @Input() maxSize: number = 5 * 1024 * 1024; // 5 MB por defecto
  @Input() convertToWebP: boolean = false;

  compressedFileSize: number | null = null;

  @Input() currentUrlPhoto:string;
  hasNewFile: boolean = false

  @Output() fileSelected = new EventEmitter<FileData>();

  readonly uploadedFile: BehaviorSubject<any> = new BehaviorSubject(null);
  private subscription!: Subscription;

  control!: FileUploadControl;

  constructor(private alertModalService:AlertModalService){

  }

  ngOnInit(): void {
    this.initializeControl();

  }



  ngOnChanges(changes: SimpleChanges): void {
    if (changes['accept'] || changes['maxFiles']) {
      this.initializeControl();
    }
  }



  private initializeControl(): void {
    // Clean up existing subscription if it exists
    if (this.subscription) {
      this.subscription.unsubscribe();
    }

    // Initialize the control with proper configuration
    this.control = new FileUploadControl(
      { 
        listVisible: true, 
        accept: this.accept, 
        discardInvalid: true, 
        multiple: this.maxFiles > 1 
      },
      [
        FileUploadValidators.filesLimit(this.maxFiles)
      ]
    );

    // Set up new subscription
    this.subscription = this.control.valueChanges.subscribe((values: Array<File>) => {
      if (values.length > 0) {
        this.processFile(values[0]);
        this.hasNewFile = true;
      } else {
        this.hasNewFile = false;
      }
    });

  }

  private getFileExtension(filename: string): string {
    return filename.slice((filename.lastIndexOf(".") - 1 >>> 0) + 2);
  }

  

  private async processFile(file: File): Promise<void> {
    this.compressedFileSize = null;
    // Verificar si es una imagen y si excede el tamaño máximo
    if (this.isImage && file.size > this.maxSize) {
      try {
        // Mostrar alerta de compresión (utilizando un servicio de alerta)      
        
          const result = await this.alertModalService.show({
            title: 'Atención',
            message:`La imagen '${file.name}' tiene un tamaño de ${this.getReadableFileSize(file.size)}, excede el tamaño permitido de ${this.getReadableFileSize(this.maxSize)}. Procederemos a comprimirlo automáticamente para ajustarlo al límite.`,
            type: 'info',
            showCancel: true,
            confirmText: 'Sí, Comprimir',
            cancelText: 'Cancelar'
          });
          
          if (result) {
            // Comprimir la imagen
            const resizedImage = await this.resizeImage(file, this.maxSize);
            this.compressedFileSize = resizedImage.size;
            // Actualizar la vista previa
            this.uploadedFile.next(resizedImage.data);
            
            // Convert Base64 back to Blob/File for upload
            const blob = await (await fetch(resizedImage.data)).blob();
            const compressedFile = new File([blob], file.name, { type: file.type });

            // Emitir el archivo comprimido
            const fileData: FileData = {
              fileName: file.name,
              fileType: file.type,
              extension: this.getFileExtension(file.name),
              data: resizedImage.data,
              size: resizedImage.size,
              originalFile: compressedFile
            };
            
            this.fileSelected.emit(fileData);
            
          }else{
            this.control.clear();
            return;
          }
        
      } catch (error) {
        this.control.clear();
      }
    } else {
      // Procesar normalmente si no necesita compresión
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
    /* if (FileReader && file) {
      const fr = new FileReader();
      fr.onload = (e) => {
        const result = e.target!.result;
        this.uploadedFile.next(result);
        
        const fileData: FileData = {
          fileName: file.name,
          fileType: file.type,
          extension: this.getFileExtension(file.name),
          data: result
        };

        this.fileSelected.emit(fileData);
      }
      fr.readAsDataURL(file);
    } */
  }


  async resizeImage(file: File, maxSize: number): Promise<{ data: string, size: number }> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
  
      // Leer el archivo como DataURL
      reader.readAsDataURL(file);
  
      reader.onload = (event) => {
        if (!event.target?.result) {
          reject('Error reading the file.');
          return;
        }
  
        const img = new Image();
        img.src = event.target.result as string;
  
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject('Failed to get 2D context.');
            return;
          }
  
          let width = img.width;
          let height = img.height;
          let quality = 0.7;
  
          canvas.width = width;
          canvas.height = height;
  
          ctx.drawImage(img, 0, 0, width, height);
  
          // Comprimir iterativamente
          let compressedBase64 = canvas.toDataURL(file.type, quality);
          
          let size = this.calculateBase64Size(compressedBase64, file.type);
  
  
          while (size > maxSize && quality > 0.1) {
            quality -= 0.1;
            width *= 0.9;
            height *= 0.9;
  
            canvas.width = width;
            canvas.height = height;
  
            ctx.drawImage(img, 0, 0, width, height);
            compressedBase64 = canvas.toDataURL(file.type, quality);
            size = this.calculateBase64Size(compressedBase64, file.type);
  
          }
  
          resolve({ data: compressedBase64, size });
        };
  
        img.onerror = () => reject('Error loading the image.');
      };
  
      reader.onerror = () => reject('Error reading the file.');
    });
  
  }
  
  
 private calculateBase64Size(base64String: string, fileType: string): number {
  const prefixLength = this.getBase64PrefixLength(fileType);
  const base64Content = base64String.slice(prefixLength);
  return Math.round((base64Content.length * 3) / 4);
}

private getBase64PrefixLength(fileType: string): number {
  switch (fileType.toLowerCase()) {
    case 'image/png':
      return 'data:image/png;base64,'.length;
    case 'image/jpg':
      return 'data:image/jpg;base64,'.length;
    case 'image/jpeg':
      return 'data:image/jpeg;base64,'.length;    
    default:
      return 'data:image/png;base64,'.length; 
  }
}

  getReadableFileSize(size: number): string {
    if (size < 1024) {
      return size + ' B';
    } else if (size < 1048576) {
      return (size / 1024).toFixed(2) + ' KB';
    } else if(size < 1073741824){
      return (size / 1048576).toFixed(2) + ' MB';
    } else{
      return (size / 1073741824).toFixed(2) + ' GB';
    }
  }

  clearExistingImage(): void {
    this.fileSelected.emit(null);
    this.currentUrlPhoto = '';
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }


  
  getFileName(url: string): string {
    return url.split('/').pop();
  }

}
