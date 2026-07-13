import type { Request, Response, NextFunction } from 'express';
import * as appointmentService from './appointment.service';

export async function createAppointment(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await appointmentService.createAppointment(req.user!.id, req.body);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

export async function cancelAppointment(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await appointmentService.cancelAppointment(req.user!, req.params.appointmentId, req.body.reason);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function rescheduleAppointment(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(200).json(await appointmentService.rescheduleAppointment(req.user!, req.params.appointmentId, req.body.slotStart));
  } catch (error) {
    next(error);
  }
}

export async function getAppointment(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await appointmentService.getAppointmentDetail(req.user!, req.params.appointmentId);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}
