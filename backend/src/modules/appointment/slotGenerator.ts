import { addMinutes, getDayOfWeek, isSameUtcDate, startOfUtcDay } from '../../shared/utils/dateTime';

export type WorkingHourBlock = {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
};

export type Slot = {
  start: string;
  end: string;
};

function parseTime(time: string) {
  const [hour, minute] = time.split(':').map(Number);
  return { hour, minute };
}

export function generateSlotsForDay(
  workingHour: WorkingHourBlock,
  slotDurationMinutes: number,
  date: Date,
  bookedStarts: string[],
  leaveDates: Date[]
): Slot[] {
  const targetDay = getDayOfWeek(date);
  if (targetDay !== workingHour.dayOfWeek) return [];

  const leave = leaveDates.some((leaveDate) => isSameUtcDate(leaveDate, date));
  if (leave) return [];

  const { hour: startHour, minute: startMinute } = parseTime(workingHour.startTime);
  const { hour: endHour, minute: endMinute } = parseTime(workingHour.endTime);

  const dayStart = startOfUtcDay(date);
  const startDate = new Date(dayStart);
  startDate.setUTCHours(startHour, startMinute, 0, 0);

  const endDate = new Date(dayStart);
  endDate.setUTCHours(endHour, endMinute, 0, 0);

  const slots: Slot[] = [];
  let current = new Date(startDate);
  while (current.getTime() + slotDurationMinutes * 60 * 1000 <= endDate.getTime()) {
    const slotStartIso = current.toISOString();
    if (!bookedStarts.includes(slotStartIso)) {
      slots.push({
        start: slotStartIso,
        end: addMinutes(current, slotDurationMinutes).toISOString(),
      });
    }
    current = addMinutes(current, slotDurationMinutes);
  }

  return slots;
}

export function generateAvailability(
  workingHours: WorkingHourBlock[],
  slotDurationMinutes: number,
  date: Date,
  bookedStarts: string[],
  leaveDates: Date[]
): Slot[] {
  return workingHours.flatMap((block) =>
    generateSlotsForDay(block, slotDurationMinutes, date, bookedStarts, leaveDates)
  );
}
