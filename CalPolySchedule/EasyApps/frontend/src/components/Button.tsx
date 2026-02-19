
const Button = ({ label }: { label: string }) => {
  return(

  <button className="
            w-full mt-6 px-6 py-4
            bg-gradient-to-r from-lime-500 to-yellow-500
            hover:from-lime-400 hover:to-yellow-400
            text-emerald-950 font-semibold text-lg
            rounded-xl
            transform transition-all duration-300
            hover:scale-[1.02] hover:shadow-xl hover:shadow-lime-400/30
            active:scale-[0.98]
            cursor-pointer
   ">
    {label}
   </button>
  )
}


export default Button
