import { useReducer } from "react";

export interface InspectorState {
  selectedItemIds: Set<string>;
  updatedItemIds: Set<string>;
  dryRun: boolean;
}

export type Action =
  | { type: "SELECT_ITEM"; id: string }
  | { type: "DESELECT_ITEM"; id: string }
  | { type: "TOGGLE_ITEM"; id: string }
  | { type: "SELECT_ALL"; ids: string[] }
  | { type: "CLEAR_SELECTION" }
  | { type: "MARK_UPDATED"; id: string }
  | { type: "TOGGLE_DRY_RUN" };

function reducer(state: InspectorState, action: Action): InspectorState {
  switch (action.type) {
    case "SELECT_ITEM": {
      const next = new Set(state.selectedItemIds);
      next.add(action.id);
      return { ...state, selectedItemIds: next };
    }
    case "DESELECT_ITEM": {
      const next = new Set(state.selectedItemIds);
      next.delete(action.id);
      return { ...state, selectedItemIds: next };
    }
    case "TOGGLE_ITEM": {
      const next = new Set(state.selectedItemIds);
      if (next.has(action.id)) next.delete(action.id);
      else next.add(action.id);
      return { ...state, selectedItemIds: next };
    }
    case "SELECT_ALL":
      return { ...state, selectedItemIds: new Set(action.ids) };
    case "CLEAR_SELECTION":
      return { ...state, selectedItemIds: new Set() };
    case "MARK_UPDATED": {
      const next = new Set(state.updatedItemIds);
      next.add(action.id);
      return { ...state, updatedItemIds: next };
    }
    case "TOGGLE_DRY_RUN":
      return { ...state, dryRun: !state.dryRun };
    default:
      return state;
  }
}

const initialState: InspectorState = {
  selectedItemIds: new Set(),
  updatedItemIds: new Set(),
  dryRun: false,
};

export function useInspectorStore() {
  const [state, dispatch] = useReducer(reducer, initialState);
  return { state, dispatch };
}
