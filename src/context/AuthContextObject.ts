import React from "react";
import type { User } from "firebase/auth";

export type AuthState = {
  user: User | null;
  loading: boolean;
  signOutFn: () => Promise<void>;
};

export const AuthContext = React.createContext<AuthState | null>(null);