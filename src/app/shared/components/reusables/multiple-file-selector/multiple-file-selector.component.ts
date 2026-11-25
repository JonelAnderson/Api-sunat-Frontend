import { Component, EventEmitter, Input, OnInit, Output } from "@angular/core";
import { PreviewImageComponent } from "../preview-image/preview-image.component";
import { PreviewPdfComponent } from "../preview-pdf/preview-pdf.component";
import { toBase64 } from "@shared/functions/helpers";
import { CommonModule } from "@angular/common";
import { SharedModule } from "@shared/shared.module";
import { NgbModal } from "@ng-bootstrap/ng-bootstrap";
import { AlertModalService } from "@shared/service/alert-modal.service";
import { ShortenFilenamePipe } from "@shared/pipes/shorten-filename.pipe";

@Component({
  selector: 'app-multiple-file-selector',
  standalone: true,
  imports: [CommonModule, SharedModule,ShortenFilenamePipe],
  templateUrl: './multiple-file-selector.component.html',
  styleUrls: ['./multiple-file-selector.component.scss']
})
export class MultipleFileSelectorComponent implements OnInit {

  @Input() allowedFileTypes: string[] = [];
  @Output() selectedFilesEvent = new EventEmitter<{ fileName: string; fileType: string; extension: string; data: string }[]>();

 
  files: { fileName: string; fileType: string; fileBase64: string; fileSize: number; }[] = [];

  constructor(
   private modalService: NgbModal,
    private alertModalService:AlertModalService
  ) {}

  ngOnInit(): void {
  }


  
  async selectedFiles(event: Event) {
    if (event.target instanceof HTMLInputElement) {
      const inputElement: HTMLInputElement = event.target;
      if (inputElement.files && inputElement.files.length > 0) {
        const files: FileList = inputElement.files;
        const filePromises: Promise<{ fileName: string; fileType: string; extension: string; data: string, size: number }>[] = [];
  
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const fileName = file.name;
          const fileType = file.type;
          const fileSize = file.size;
          const fileExtension = fileName.split('.').pop()?.toLowerCase() || '';
          
           // Validación de tamaño máximo (5 MB = 5 * 1024 * 1024 bytes)
            const maxSize = 5 * 1024 * 1024;
            if (fileSize > maxSize && this.isImage(fileType) && !this.isFileAlreadySelected(fileName)) {

              const result =await this.alertModalService.show(
                {
                  title: 'Atención',
                  message: `La imagen '${fileName}' tiene un tamaño de ${this.getReadableFileSize(fileSize)}, excede el tamaño permitido de 5 MB. Procederemos a comprimirlo automáticamente para ajustarlo al límite.`,
                  type: 'info',
                  showCancel: true,
                  confirmText: 'Sí, Comprimir',
                  cancelText: 'Cancelar'
                });

                if (result) {
                  // Redimensionar la imagen solo después de la confirmación
                  const resizedImageResult = await this.resizeImage(file, maxSize);
                  const resizedImagePromise = {
                    fileName: fileName,
                    fileType: fileType,
                    extension: fileExtension,
                    data: resizedImageResult.data.split(',')[1],
                    size: resizedImageResult.size
                  };
                  filePromises.push(Promise.resolve(resizedImagePromise));
                }
                continue;

            }

            if (fileSize > maxSize){
              await this.alertModalService.showNotification(
                'Atención',
                 `El archivo '${fileName}' tiene un tamaño de ${this.getReadableFileSize(fileSize)}, excede el tamaño permitido de 5 MB.`,
                'danger'
              );
              continue; 
            }

            if (this.isFileAlreadySelected(fileName)) {
              await this.alertModalService.showNotification(
                'Atención',
                 `El archivo '${fileName}' ya ha sido seleccionado.`,
                'danger'
              );
               continue; 

             } 
             
             if (!this.allowedFileTypes.includes(fileType)) {

              const allowedTypesString = this.getAllowedFileTypesString();
              await this.alertModalService.showNotification(
                'Atención',
                 `El tipo de archivo '${fileName}' no está permitido. Solo se permiten archivos de los siguientes tipos: ${allowedTypesString}.`,
                'danger'
              );
               continue;

             } 


            const filePromise = toBase64(file).then((value: string) => ({
              fileName: fileName,
              fileType: fileType,
              extension: fileExtension,
              data: value,
              size: fileSize
            }));
    
            filePromises.push(filePromise);
             
     
             
          }
     
           Promise.all(filePromises).then(fileDetails => {
             const newFiles = fileDetails.map(file => ({
               fileName: file.fileName,
               fileType: file.fileType,
               fileBase64: file.data,
               fileSize: file.size
             }));
             this.files.push(...newFiles); 
             this.selectedFilesEvent.emit(this.getEmitFiles());
             inputElement.value = '';
           });

          

           
      }
    }
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
  
getImageSrc(file: { fileType: string, fileBase64: string }): string {
  const base64Prefix = 'data:' + file.fileType + ';base64,';
  if (file.fileBase64.startsWith(base64Prefix)) {
    return file.fileBase64; 
  }
  return base64Prefix + file.fileBase64;
}

  private isFileAlreadySelected(fileName: string): boolean {
    return this.files.some(file => file.fileName === fileName);
  }

  getAllowedFileTypesString(): string {
    return this.allowedFileTypes
      .map(type => this.formatFileType(type))
      .join(', ');
  }
  
  private formatFileType(mimeType: string): string {
    switch (mimeType) {
      case 'image/jpeg':
        return 'JPEG';
      case 'image/png':
        return 'PNG';
      case 'image/jpg':
        return 'JPG';
      case 'application/pdf':
        return 'PDF';
      default:
        return mimeType; // Por si hay algún otro tipo adicional
    }
  }

  isImage(fileType: string): boolean {
    return /^(image\/jpg|image\/jpeg|image\/png)$/i.test(fileType);
  }

  isPdf(fileType: string): boolean {
    return /^application\/pdf$/i.test(fileType);
  }
  
  getFileName(url: string): string {
    return url.split('/').pop();
  }

  removeFile(index: number) {
    this.files.splice(index, 1);
    this.selectedFilesEvent.emit(this.getEmitFiles());
  }

 
  
  getEmitFiles() {
    return this.files.map(file => ({
      fileName: file.fileName,
      fileType: file.fileType,
      extension: file.fileName.split('.').pop(),
      data: file.fileBase64,
      size: file.fileSize
    }));
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
  


  openPreviewImage(fileUrl: string): void {

    const modalRef = this.modalService.open(PreviewImageComponent, {
        backdrop: 'static',  
        keyboard: false,      
        centered: true,
        scrollable:true,
        size:'lg'
      });
      modalRef.componentInstance.fileUrl = fileUrl;
      modalRef.componentInstance.panelClass = 'preview-dialog';
        modalRef.result.then(
          (result) => {
            if(result){
              
            }
            
          }
        );
   
  }

  openPreviewPdf(fileUrl: string): void {

    const modalRef = this.modalService.open(PreviewPdfComponent, {
      backdrop: 'static',  
      keyboard: false,      
      centered: true,
      scrollable:true,
         size:'lg'
    });
    modalRef.componentInstance.fileUrl = fileUrl;
    modalRef.componentInstance.panelClass = 'preview-dialog';
      modalRef.result.then(
        (result) => {
          if(result){
            
          }
          
        }
      );

  }
}
