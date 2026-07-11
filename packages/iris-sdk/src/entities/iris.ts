export interface IrisActions {
  take: () => {
    buildTx: () => void;
    getRequirements: () => void;
  };
}

export class Iris implements IrisActions {
  take() {
    return {
      buildTx: () => {},
      getRequirements: () => {},
    };
  }
}
