import wabtFactory from 'wabt'
import { mkdirSync, writeFileSync } from 'node:fs'

// Original kernel: float64 accumulation and float32 output match the CPU
// interpreter. No SIMD requirement, external runtime, model or network access.
const wat = `(module
  (memory (export "memory") 128 128)
  (func (export "pointwise") (param $src i32) (param $weights i32) (param $out i32)
    (param $channels i32) (param $plane i32) (param $outputs i32)
    (local $oc i32) (local $p i32) (local $ic i32) (local $sum f64)
    (local $s i32) (local $k i32)
    (loop $output
      (local.set $p (i32.const 0))
      (loop $pixel
        (local.set $ic (i32.const 0))
        (local.set $sum (f64.const 0))
        (local.set $s (i32.add (local.get $src) (i32.shl (local.get $p) (i32.const 2))))
        (local.set $k (i32.add (local.get $weights) (i32.shl (i32.mul (local.get $oc) (local.get $channels)) (i32.const 2))))
        (loop $channel
          (local.set $sum (f64.add (local.get $sum)
            (f64.mul (f64.promote_f32 (f32.load (local.get $s))) (f64.promote_f32 (f32.load (local.get $k))))))
          (local.set $s (i32.add (local.get $s) (i32.shl (local.get $plane) (i32.const 2))))
          (local.set $k (i32.add (local.get $k) (i32.const 4)))
          (local.set $ic (i32.add (local.get $ic) (i32.const 1)))
          (br_if $channel (i32.lt_u (local.get $ic) (local.get $channels)))
        )
        (f32.store (i32.add (local.get $out) (i32.shl (i32.add (i32.mul (local.get $oc) (local.get $plane)) (local.get $p)) (i32.const 2))) (f32.demote_f64 (local.get $sum)))
        (local.set $p (i32.add (local.get $p) (i32.const 1)))
        (br_if $pixel (i32.lt_u (local.get $p) (local.get $plane)))
      )
      (local.set $oc (i32.add (local.get $oc) (i32.const 1)))
      (br_if $output (i32.lt_u (local.get $oc) (local.get $outputs)))
    )
  )
  (func (export "spatial") (param $src i32) (param $weights i32) (param $out i32)
    (param $channels i32) (param $height i32) (param $width i32) (param $outputs i32)
    (param $oh i32) (param $ow i32) (param $sy i32) (param $sx i32)
    (param $py i32) (param $px i32) (param $depthwise i32)
    (local $oc i32) (local $y i32) (local $x i32) (local $ic i32)
    (local $ky i32) (local $kx i32) (local $iy i32) (local $ix i32)
    (local $count i32) (local $channel i32) (local $index i32) (local $sum f64)
    (local.set $count (select (i32.const 1) (local.get $channels) (local.get $depthwise)))
    (loop $output
      (local.set $y (i32.const 0))
      (loop $row
        (local.set $x (i32.const 0))
        (loop $pixel
          (local.set $sum (f64.const 0))
          (local.set $ic (i32.const 0))
          (loop $channel
            (local.set $channel (select (local.get $oc) (local.get $ic) (local.get $depthwise)))
            (local.set $ky (i32.const 0))
            (loop $kernelrow
              (local.set $iy (i32.sub (i32.add (i32.mul (local.get $y) (local.get $sy)) (local.get $ky)) (local.get $py)))
              (if (i32.lt_u (local.get $iy) (local.get $height)) (then
                (local.set $kx (i32.const 0))
                (loop $kernelpixel
                  (local.set $ix (i32.sub (i32.add (i32.mul (local.get $x) (local.get $sx)) (local.get $kx)) (local.get $px)))
                  (if (i32.lt_u (local.get $ix) (local.get $width)) (then
                    (local.set $index (i32.add (i32.mul (i32.add (i32.mul (local.get $channel) (local.get $height)) (local.get $iy)) (local.get $width)) (local.get $ix)))
                    local.get $sum
                    (f32.load (i32.add (local.get $src) (i32.shl (local.get $index) (i32.const 2))))
                    f64.promote_f32
                    local.get $weights
                    local.get $oc
                    local.get $count
                    i32.mul
                    local.get $ic
                    i32.add
                    i32.const 3
                    i32.mul
                    local.get $ky
                    i32.add
                    i32.const 3
                    i32.mul
                    local.get $kx
                    i32.add
                    i32.const 2
                    i32.shl
                    i32.add
                    f32.load
                    f64.promote_f32
                    f64.mul
                    f64.add
                    local.set $sum
                  ))
                  (local.set $kx (i32.add (local.get $kx) (i32.const 1)))
                  (br_if $kernelpixel (i32.lt_u (local.get $kx) (i32.const 3)))
                )
              ))
              (local.set $ky (i32.add (local.get $ky) (i32.const 1)))
              (br_if $kernelrow (i32.lt_u (local.get $ky) (i32.const 3)))
            )
            (local.set $ic (i32.add (local.get $ic) (i32.const 1)))
            (br_if $channel (i32.lt_u (local.get $ic) (local.get $count)))
          )
          (f32.store (i32.add (local.get $out) (i32.shl (i32.add (i32.mul (i32.add (i32.mul (local.get $oc) (local.get $oh)) (local.get $y)) (local.get $ow)) (local.get $x)) (i32.const 2))) (f32.demote_f64 (local.get $sum)))
          (local.set $x (i32.add (local.get $x) (i32.const 1)))
          (br_if $pixel (i32.lt_u (local.get $x) (local.get $ow)))
        )
        (local.set $y (i32.add (local.get $y) (i32.const 1)))
        (br_if $row (i32.lt_u (local.get $y) (local.get $oh)))
      )
      (local.set $oc (i32.add (local.get $oc) (i32.const 1)))
      (br_if $output (i32.lt_u (local.get $oc) (local.get $outputs)))
    )
  )
)`
const wabt = await wabtFactory()
const module = wabt.parseWat('convolutions.wat', wat)
module.validate()
const { buffer } = module.toBinary({ write_debug_names: false })
mkdirSync(new URL('../src/static/safety/', import.meta.url), { recursive: true })
writeFileSync(new URL('../src/static/safety/convolutions.wasm', import.meta.url), buffer)
module.destroy()
console.log(`Built local safety kernel: ${buffer.length} bytes`)
