export interface MasterDetailResponse {
  id: number;
  code?: string;
  name: string;
  value?: string;
  state:string;
  isActive: boolean;
  createdOn: Date;
  badgeColor?: string;
}

export interface MasterDetailRequest {
  code:string;
  name: string;
  value?: string;
}

export interface MasterDetailEditRequest {
  id: number;
  code:string;
  name: string;
  value?: string;
}
