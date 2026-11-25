export interface MenuStateItems {
    type: "link";
    id?: "all" | "SIN_ESTADO" | "PENDIENTE" | "EVALUACION" | "INSPECCION" | "OBSERVADA" | "RECHAZADA" | "APROBADA" | "FACTURADO" | "CLIENTE_CREDITO" | "CLIENTE_CANCELO_CREDITO" | "CLIENTE_VUELVE_COMPRAR_A_CREDITO" | "NO_APROBADO" | "REGISTRADO" | "PAGADO" | "DEBE";
    icon?: string;
    label: string;
    value?: number;
    class?: {
      icon?: string;
    };
    size?: string;
  }
  