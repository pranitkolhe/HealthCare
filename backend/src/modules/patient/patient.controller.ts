import type { Request, Response, NextFunction } from 'express';
import * as patientService from './patient.service';

export async function getProfile(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await patientService.getPatientProfile(req.user!.id);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function updateProfile(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await patientService.updatePatientProfile(req.user!.id, req.body);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function listAppointments(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await patientService.listPatientAppointments(req.user!.id, {
      status: req.query.status as string | undefined,
      page: Number(req.query.page),
      limit: Number(req.query.limit),
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}
