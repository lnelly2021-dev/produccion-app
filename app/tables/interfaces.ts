export type EstadoMesa = "libre" | "ocupada" | "reservada";

export interface Mesa {
  _id:    string;
  id:     string;   // alias de _id para compatibilidad
  nombre: string;
  numero: number;
  estado: EstadoMesa;
  mesero: string;
  pedidoActivo?: any;
}
