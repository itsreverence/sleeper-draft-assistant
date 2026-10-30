export const errorCopy = {
  sleeperLookup: "Could not look up your Sleeper leagues. Check your connection, then try again.",
  sleeperNotFound: (username: string, hasLeague: boolean) => hasLeague
    ? `Sleeper could not find that league for ${username}. Check the username and league link, then try again.`
    : `No Sleeper user named ${username}. Check the spelling or paste a league URL.`,
  draftLoad: "Could not load this draft. Check the draft ID, then try again.",
  rankingImport: "Could not import these rankings. Choose a current FantasyPros ECR export, then try again.",
  seasonProjectionImport: "Could not import season projections. Choose the FantasyPros position exports, then try again.",
  adpImport: "Could not import Sleeper ADP. Choose the FantasyPros Overall ADP export, then try again.",
  seasonValueImport: "Could not import season value rankings. Choose Overall ROS ECR or Overall Draft ECR, then try again.",
  weeklyImport: "Could not import weekly projections. Choose the FantasyPros position exports, then try again.",
  providerStatus: "Could not check the Assistant status. Review the Assistant settings, then retry.",
  draftStrategy: "The Assistant could not evaluate this board. Retry, or ask about this draft instead.",
  draftAnswer: "The Assistant could not answer because the draft state is unavailable. Reload the draft, then ask again.",
  teamAnswer: "The Assistant could not answer because team context is unavailable. Refresh the team, then ask again.",
};
