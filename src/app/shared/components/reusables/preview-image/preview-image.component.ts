import { Component, ElementRef, Inject, Input, OnInit } from '@angular/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { SharedModule } from '@shared/shared.module';

@Component({
  selector: 'app-preview-image',
  standalone: true,
  imports: [SharedModule],
  templateUrl: './preview-image.component.html',
  styleUrl: './preview-image.component.scss'
})
export class PreviewImageComponent implements OnInit {
  fileUrlData:string;
  zoomLevel: number = 1;

  @Input() fileUrl:string;
  constructor(public activeModal: NgbActiveModal) {

  }

  ngOnInit(): void {
    if (this.fileUrl) {
      this.fileUrlData=this.fileUrl
    }
  }

  zoomIn(): void {
    this.zoomLevel += 0.5;
    this.applyZoom();
  }

  zoomOut(): void {
    if (this.zoomLevel > 1) {
      this.zoomLevel -= 0.5;
      this.applyZoom();
    }
  }

  private applyZoom(): void {
    const modalElement = document.querySelector('.preview-dialog') as HTMLElement;
    modalElement.style.transform = `scale(${this.zoomLevel})`;
  }


} 
