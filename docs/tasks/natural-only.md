# Retire alternate visual styles

Current owner direction supersedes the earlier request to preserve the voxel
style: remove its renderer, Styles selector and switching links. Natural 3D with
a perspective camera is the only selectable town view. Old style query values
must not reactivate the retired scene. Keep the automatic canvas fallback for
technical rendering failures; it is not a user-selectable visual style.

Acceptance: no voxel imports or Styles controls; legacy style URLs still render
Natural 3D; third-person controls, chat, pause and technical fallback keep working.
