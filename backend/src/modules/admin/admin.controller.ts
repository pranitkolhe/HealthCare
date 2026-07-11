import type { Request, Response, NextFunction } from 'express';
import * as adminService from './admin.service';

export async function createDoctor(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await adminService.createDoctor(req.body);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

export async function updateDoctor(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await adminService.updateDoctor(req.params.doctorId, req.body);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function deleteDoctor(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await adminService.softDeleteDoctor(req.params.doctorId);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function markLeave(req: Request, res: Response, next: NextFunction) {
  try {
    const leaveDate = new Date(req.body.leaveDate);
    const result = await adminService.markDoctorLeave(req.params.doctorId, leaveDate, req.body.reason);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

export async function listUsers(req: Request, res: Response, next: NextFunction) {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const result = await adminService.listUsers(req.query.role as string | undefined, page, limit);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function deactivateUser(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await adminService.deactivateUser(req.params.userId);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}
