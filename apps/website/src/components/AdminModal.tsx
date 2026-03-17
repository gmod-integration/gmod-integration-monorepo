import { Component } from 'solid-js'

interface AdminModalProps {
  title: string
  id: string
  children: any
}

const AdminModal: Component<AdminModalProps> = (props) => {
  return (
    <>
      <dialog class="modal" id={props.id}>
        <div class="modal-box">
          <form method="dialog">
            <button class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2">
              <i class="fa-solid fa-times text-lg"></i>
            </button>
          </form>
          <div class="modal-body flex flex-col gap-4">
            <h2 class="text-2xl font-bold">{props.title}</h2>
            {props.children}
          </div>
        </div>
      </dialog>
    </>
  )
}

export default AdminModal
