import { createContext, useContext } from 'react';

export const AuthContext = createContext(null);

/** { me, refresh, logout } — me is undefined while loading, null when signed out. */
export function useAuth() {
  return useContext(AuthContext);
}

export const ROLE_LABEL = { owner: 'Owner', admin: 'Admin', operator: 'Operator', viewer: 'Viewer', sts: 'STS staff' };
export const ROLE_HELP = {
  admin: 'Manage the team, agents and sites',
  operator: 'View the twin and agent status',
  viewer: 'View the live 3D twin (read-only)',
};
export const MANAGE = new Set(['owner', 'admin']);

/** Pick the organisation to work in: the requested id if it's one of theirs, else the first. */
export function pickOrg(me, orgId) {
  if (!me?.orgs?.length) return null;
  return me.orgs.find((o) => o.id === orgId) || me.orgs[0];
}
