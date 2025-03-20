Require Import List.
Require Import Lra.
Require Import Reals.
Open Scope R_scope.

(* Define non-empty list type *)
Inductive ne_list (A : Type) : Type :=
  | singleton : A -> ne_list A
  | ne_cons : A -> ne_list A -> ne_list A.

Arguments singleton {A} _.
Arguments ne_cons {A} _ _.

(* Define fold operation for non-empty lists *)
Fixpoint ne_fold_right {A B : Type}
  (f : A -> B -> B) (init : B) (l : ne_list A) : B :=
  match l with
  | singleton x => f x init
  | ne_cons x xs => f x (ne_fold_right f init xs)
  end.

(* Find the minimum element in a non-empty list *)
Fixpoint ne_min (l : ne_list R) : R :=
  match l with
  | singleton x => x
  | ne_cons x xs => Rmin x (ne_min xs)
  end.

(* Define smooth min for a non-empty list of values *)
Definition smooth_min_ne (l: ne_list R) (r: R) : R :=
  -r * ln(ne_fold_right (fun d acc => exp(-d/r) + acc) 0 l).

(* Explicit positivity lemma for any offset *)
Lemma ne_fold_right_exp_pos: forall l offset r,
  r > 0 ->
  0 < ne_fold_right (fun d acc => exp(-(d-offset)/r) + acc) 0 l.
Proof.
  intros l offset r Hr.
  induction l.
  - simpl. rewrite Rplus_0_r. apply exp_pos.
  - simpl. apply Rplus_lt_0_compat.
    + apply exp_pos.
    + apply IHl.
Qed.

(* Factorization lemma for non-empty lists *)
Lemma exp_factor: forall a dmin r,
  exp(-a/r) = exp(-dmin/r) * exp(-(a-dmin)/r).
Proof.
  intros; replace (-a/r) with (-dmin/r + (-(a-dmin)/r)) by lra; apply exp_plus.
Qed.

Lemma exp_sum_factor_split_ne: forall l dmin r,
  r > 0 ->
  ne_fold_right (fun d acc => exp(-d/r) + acc) 0 l =
  exp(-dmin/r) * ne_fold_right (fun d acc => exp(-(d-dmin)/r) + acc) 0 l.
Proof.
  intros l dmin r _; induction l; simpl.
  - rewrite (exp_factor a dmin r). ring.
  - rewrite (exp_factor a dmin r), IHl, Rmult_plus_distr_l. reflexivity.
Qed.

(* Main theorem for non-empty lists *)
Theorem smooth_min_ne_complete: forall l r,
  r > 0 ->
  smooth_min_ne l r = ne_min l +
    (-r * ln(ne_fold_right (fun d acc => exp(-(d-(ne_min l))/r) + acc) 0 l)).
Proof.
  intros l r Hr.

  (* Identify the minimum element *)
  set (dmin := ne_min l).

  (* Unfold definition *)
  unfold smooth_min_ne.

  (* Apply our factorization lemma directly to match the goal structure *)
  rewrite (exp_sum_factor_split_ne l dmin r Hr).

  (* Apply logarithm properties *)
  rewrite ln_mult.
  - rewrite ln_exp.
    rewrite Rmult_plus_distr_l.
    field.
    apply Rgt_not_eq; exact Hr.
  - apply exp_pos.
  - (* Use our dedicated positivity lemma *)
    apply ne_fold_right_exp_pos; assumption.
Qed.
