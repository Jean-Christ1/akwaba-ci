import { STATUS_LABEL, STATUS_STEPS, type ErrandStatus } from "@/modules/errands/domain";

interface ErrandTimelineProps {
  status: ErrandStatus;
}

/**
 * Frise de suivi d'une course.
 *
 * Les états d'exception, annulation et litige, ne figurent pas dans la suite
 * normale : la frise disparaît alors plutôt que d'afficher une progression qui
 * n'a plus cours.
 */
export function ErrandTimeline({ status }: ErrandTimelineProps) {
  const etape = STATUS_STEPS.indexOf(status);
  if (etape < 0) return null;

  return (
    <ol className="mt-4 flex flex-wrap gap-1.5">
      {STATUS_STEPS.map((s, i) => (
        <li
          key={s}
          className={`rounded-full px-2.5 py-1 text-[11px] ${
            i <= etape ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
          }`}
        >
          {STATUS_LABEL[s]}
        </li>
      ))}
    </ol>
  );
}

export default ErrandTimeline;
