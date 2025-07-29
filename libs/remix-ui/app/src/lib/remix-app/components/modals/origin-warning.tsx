import React, { useEffect, useState } from 'react'
import { ModalDialog } from '@remix-ui/modal-dialog'
import { useDialogDispatchers } from '../../context/provider'

const OriginWarning = () => {
  const { alert } = useDialogDispatchers()

  useEffect(() => {
    // check the origin and warn message
    if (window.location.hostname === 'yann300.github.io') {
      setContent('This UNSTABLE ALPHA branch of Remix has been moved to http://ethereum.github.io/remix-live-alpha.')
    } else if (
      window.location.hostname === 'remix-alpha.ethereum.org' ||
      (window.location.hostname === 'ethereum.github.io' && window.location.pathname.indexOf('/remix-live-alpha') === 0)
    ) {
      setContent('Welcome to the Remix alpha instance. Please use it to try out latest features. But use preferably https://remix.ethereum.org for any production work.')
    } else if (
      window.location.protocol.indexOf('http') === 0 &&
      window.location.hostname !== 'remix.ethereum.org' &&
      window.location.hostname !== 'localhost' &&

  return <></>
}

export default OriginWarning
