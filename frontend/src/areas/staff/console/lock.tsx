import { createContext, useContext } from "react";

export type StaffCtx = {
  /** True when nobody is signed in on a shared tablet: the board is visible but read-only. */
  locked: boolean;
  /** Call before an action. Returns false and asks for a PIN when the tablet is locked. */
  ensureUnlocked: () => boolean;
};

export const LockContext = createContext<StaffCtx>({ locked: false, ensureUnlocked: () => true });
export const useStaff = () => useContext(LockContext);
