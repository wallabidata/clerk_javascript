This repository is a fork of [Clerk's javascript repo](https://github.com/clerk/javascript) with some small changes. See [WAL-1190](https://linear.app/wallabi/issue/WAL-1190/fork-clerkjavascript-and-patch) for details.

To build/deploy into Wallabi:

1.  `pnpm build`
1.  `cp packages/clerk-js/dist/*.js ~/${WALLABI_APP_DIR}/public/clerk/`
1.  Publish and merge the changes to Wallabi
