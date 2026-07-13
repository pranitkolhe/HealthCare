import type { Request, Response, NextFunction } from 'express';
import * as doctorService from './doctor.service';

export async function searchDoctors(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await doctorService.searchDoctors({
      specialization: req.query.specialization as string | undefined,
      search: req.query.search as string | undefined,
      page: Number(req.query.page),
      limit: Number(req.query.limit),
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function getAvailability(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await doctorService.getDoctorAvailability(req.params.doctorId, req.query.date as string);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function getSchedule(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(200).json(await doctorService.getDoctorSchedule(req.params.doctorId));
  } catch (error) {
    next(error);
  }
}

export async function listAppointments(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await doctorService.listDoctorAppointments(req.user!.id, {
      status: req.query.status as string | undefined,
      date: req.query.date as string | undefined,
      page: Number(req.query.page),
      limit: Number(req.query.limit),
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function addNotes(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await doctorService.addDoctorNotes(req.user!.id, req.params.appointmentId, req.body.doctorNotes, req.body.prescription, req.body.medications);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function retryPreVisitSummary(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(202).json(await doctorService.retryPreVisitSummary(req.user!.id, req.params.appointmentId));
  } catch (error) {
    next(error);
  }
}

export async function retryPostVisitSummary(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(202).json(await doctorService.retryPostVisitSummary(req.user!.id, req.params.appointmentId));
  } catch (error) {
    next(error);
  }
}

export async function getProfile(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(200).json(await doctorService.getDoctorProfile(req.user!.id));
  } catch (error) {
    next(error);
  }
}

export async function updateAvailability(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(200).json(await doctorService.updateDoctorAvailability(req.user!.id, req.body));
  } catch (error) {
    next(error);
  }
}

export async function markLeave(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(201).json(await doctorService.markDoctorLeave(req.user!.id, req.body.leaveDate, req.body.reason));
  } catch (error) {
    next(error);
  }
}

export async function saveManualPostVisitSummary(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(200).json(await doctorService.saveManualPostVisitSummary(req.user!.id, req.params.appointmentId, req.body));
  } catch (error) {
    next(error);
  }
}
