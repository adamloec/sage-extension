// State management
let _state = vscode.getState() || initialState;

export function getState() {
    return _state;
}

export function updateState(newState) {
    _state = newState;
    vscode.setState(_state);
}

// Initialize state
export function initializeState(initialStateData) {
    _state = vscode.getState() || initialStateData;
    vscode.setState(_state);
    return _state;
} 