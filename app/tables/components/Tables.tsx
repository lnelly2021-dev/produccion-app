import { Mesa } from "../interfaces";
import MesaCard from "./MesaCard";

interface Props {
  mesas: Mesa[];
  onSelectMesa: (mesa: Mesa) => void;
  alertaMesaId?: string | null;
}

export default function Tables({ mesas, onSelectMesa, alertaMesaId }: Props) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {mesas.map((mesa) => (
        <MesaCard
          key={mesa.id}
          mesa={mesa}
          onClick={onSelectMesa}
          tieneAlerta={alertaMesaId === mesa._id || alertaMesaId === mesa.id}
        />
      ))}
    </div>
  );
}