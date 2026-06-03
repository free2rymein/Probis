type OutcomeOrderColumns = {
  sameResolutionDate: string;
  probability: string;
  endDate: string;
  tieBreaker: string;
};

export const outcomeDisplayOrder = ({
  sameResolutionDate,
  probability,
  endDate,
  tieBreaker
}: OutcomeOrderColumns) => `
  case when ${sameResolutionDate} then ${probability} end desc nulls last,
  case when not ${sameResolutionDate} then ${endDate} end asc nulls last,
  ${probability} desc nulls last,
  ${tieBreaker} asc
`;

export const effectiveResolutionDate = ({
  title,
  endDate,
  eventEndDate
}: {
  title: string;
  endDate: string;
  eventEndDate: string;
}) => `
  case
    when ${title} ~* '^(january|february|march|april|may|june|july|august|september|october|november|december) [0-9]{1,2}$'
    then to_date(
      ${title} || ' ' || extract(year from coalesce(${eventEndDate}, ${endDate}, now()))::int::text,
      'Month DD YYYY'
    )::timestamptz
    else ${endDate}
  end
`;

const MONTH_DAY_TITLE = /^(january|february|march|april|may|june|july|august|september|october|november|december) ([0-9]{1,2})$/i;

export type PreviewOutcome = {
  id: string;
  title: string;
  probability: number | null;
  endDate: Date | null;
  eventEndDate: Date | null;
};

const compareNullableNumbersDesc = (left: number | null, right: number | null) => {
  if (left === null) return right === null ? 0 : 1;
  if (right === null) return -1;
  return right - left;
};

const compareNullableDatesAsc = (left: Date | null, right: Date | null) => {
  if (left === null) return right === null ? 0 : 1;
  if (right === null) return -1;
  return left.getTime() - right.getTime();
};

export const effectivePreviewResolutionDate = ({ title, endDate, eventEndDate }: PreviewOutcome) => {
  const match = title.match(MONTH_DAY_TITLE);
  if (!match) return endDate;
  const referenceDate = eventEndDate ?? endDate ?? new Date();
  const parsed = new Date(`${match[1]} ${match[2]}, ${referenceDate.getUTCFullYear()} 00:00:00 UTC`);
  return Number.isNaN(parsed.getTime()) ? endDate : parsed;
};

export const orderPreviewOutcomes = (outcomes: PreviewOutcome[]) => {
  const prepared = outcomes.map((outcome) => ({
    ...outcome,
    sortEndDate: effectivePreviewResolutionDate(outcome)
  }));
  const resolutionDates = new Set(
    prepared.flatMap(({ sortEndDate }) => (sortEndDate ? [sortEndDate.getTime()] : []))
  );
  const sameResolutionDate = resolutionDates.size <= 1;
  prepared.sort((left, right) => {
    const primary = sameResolutionDate
      ? compareNullableNumbersDesc(left.probability, right.probability)
      : compareNullableDatesAsc(left.sortEndDate, right.sortEndDate);
    return primary
      || compareNullableNumbersDesc(left.probability, right.probability)
      || left.title.localeCompare(right.title);
  });
  return { outcomes: prepared, sameResolutionDate };
};
